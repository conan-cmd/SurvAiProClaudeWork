import "server-only"
import { db } from "@/lib/db"
import { encryptSecret, decryptSecret } from "@/lib/crypto"
import { computeDeposit } from "@/lib/stripe"

// Per-firm Xero accounting integration (OAuth 2). v1 scope: when a client
// pays their deposit through SurvAIPro, raise a DRAFT deposit invoice in the
// firm's Xero so the office has the VAT-correct record ready to approve and
// match against the Stripe payout. Best-effort throughout — an accounting
// hiccup never blocks the client's payment.

const AUTH_BASE = "https://login.xero.com/identity/connect/authorize"
const TOKEN_URL = "https://identity.xero.com/connect/token"
const API_BASE = "https://api.xero.com/api.xro/2.0"

export const XERO_SELECT = {
  id: true,
  xeroAccessToken: true,
  xeroRefreshToken: true,
  xeroTokenExpiresAt: true,
  xeroTenantId: true,
} as const

type XeroOrg = {
  id: string
  xeroAccessToken: string | null
  xeroRefreshToken: string | null
  xeroTokenExpiresAt: Date | null
  xeroTenantId: string | null
}

export function xeroAvailable(): boolean {
  return Boolean(process.env.XERO_CLIENT_ID && process.env.XERO_CLIENT_SECRET)
}

export function xeroConnected(org: { xeroRefreshToken?: string | null; xeroTenantId?: string | null }): boolean {
  return Boolean(org.xeroRefreshToken && org.xeroTenantId)
}

export function authorizeUrl(state: string, redirectUri: string): string {
  const params = new URLSearchParams({
    response_type: "code",
    client_id: process.env.XERO_CLIENT_ID || "",
    redirect_uri: redirectUri,
    scope: "offline_access accounting.transactions accounting.contacts",
    state,
  })
  return `${AUTH_BASE}?${params.toString()}`
}

function basicAuth(): string {
  return "Basic " + Buffer.from(`${process.env.XERO_CLIENT_ID}:${process.env.XERO_CLIENT_SECRET}`).toString("base64")
}

type TokenResponse = { access_token: string; refresh_token: string; expires_in: number }

export async function exchangeCodeForTokens(code: string, redirectUri: string): Promise<TokenResponse> {
  const res = await fetch(TOKEN_URL, {
    method: "POST",
    headers: { Authorization: basicAuth(), "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ grant_type: "authorization_code", code, redirect_uri: redirectUri }),
    signal: AbortSignal.timeout(12000),
  })
  const json = (await res.json().catch(() => ({}))) as Partial<TokenResponse> & { error?: string }
  if (!res.ok || !json.access_token) throw new Error(json.error || `Xero token exchange failed (${res.status})`)
  return json as TokenResponse
}

// First connected Xero organisation for this token (firms almost always have one).
export async function firstTenant(accessToken: string): Promise<{ tenantId: string; tenantName: string } | null> {
  const res = await fetch("https://api.xero.com/connections", {
    headers: { Authorization: `Bearer ${accessToken}` },
    signal: AbortSignal.timeout(12000),
  })
  const json = (await res.json().catch(() => [])) as { tenantId?: string; tenantName?: string }[]
  const t = Array.isArray(json) ? json[0] : null
  return t?.tenantId ? { tenantId: t.tenantId, tenantName: t.tenantName || "Xero organisation" } : null
}

// Valid access token, refreshing (and persisting — Xero ROTATES refresh
// tokens, so the new one must always be stored) when near expiry.
async function accessToken(org: XeroOrg): Promise<string | null> {
  if (!org.xeroRefreshToken) return null
  const expiresAt = org.xeroTokenExpiresAt?.getTime() ?? 0
  if (org.xeroAccessToken && expiresAt - Date.now() > 60_000) {
    return decryptSecret(org.xeroAccessToken)
  }
  const res = await fetch(TOKEN_URL, {
    method: "POST",
    headers: { Authorization: basicAuth(), "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      grant_type: "refresh_token",
      refresh_token: decryptSecret(org.xeroRefreshToken),
    }),
    signal: AbortSignal.timeout(12000),
  })
  const json = (await res.json().catch(() => ({}))) as Partial<TokenResponse> & { error?: string }
  if (!res.ok || !json.access_token) throw new Error(json.error || `Xero token refresh failed (${res.status})`)
  await db.organization.update({
    where: { id: org.id },
    data: {
      xeroAccessToken: encryptSecret(json.access_token),
      xeroRefreshToken: encryptSecret(json.refresh_token!),
      xeroTokenExpiresAt: new Date(Date.now() + (json.expires_in || 1800) * 1000),
    },
  })
  return json.access_token
}

async function xeroFetch(
  org: XeroOrg,
  path: string,
  opts?: { method?: string; body?: Record<string, unknown> }
): Promise<Record<string, unknown>> {
  const token = await accessToken(org)
  if (!token || !org.xeroTenantId) throw new Error("Xero not connected")
  const res = await fetch(`${API_BASE}${path}`, {
    method: opts?.method || "GET",
    headers: {
      Authorization: `Bearer ${token}`,
      "Xero-Tenant-Id": org.xeroTenantId,
      Accept: "application/json",
      ...(opts?.body ? { "Content-Type": "application/json" } : {}),
    },
    body: opts?.body ? JSON.stringify(opts.body) : undefined,
    signal: AbortSignal.timeout(15000),
  })
  const json = (await res.json().catch(() => ({}))) as Record<string, unknown>
  if (!res.ok) {
    throw new Error(
      typeof json.Detail === "string" ? json.Detail : `Xero returned ${res.status}`
    )
  }
  return json
}

// Raise the DRAFT deposit invoice for a just-paid proposal. Idempotent — a
// stored invoice id means it already exists. Amounts are VAT-inclusive (the
// deposit is charged on the gross agreed total), so lines use Inclusive with
// UK 20% output VAT for Xero to back the VAT out correctly.
export async function createDepositInvoice(proposalId: string): Promise<void> {
  try {
    const proposal = await db.proposal.findUnique({
      where: { id: proposalId },
      include: {
        organization: { select: { ...XERO_SELECT, depositRules: true } },
        survey: { select: { title: true, clientAddress: true, clientCompany: true, isResidential: true } },
        pricingLineItems: true,
      },
    })
    if (!proposal || proposal.xeroDepositInvoiceId) return
    const org = proposal.organization
    if (!xeroAvailable() || !xeroConnected(org)) return

    const { calculateProposalTotals } = await import("@/lib/utils")
    const agreed = proposal.agreedTotal ?? calculateProposalTotals(proposal.pricingLineItems).total
    const gross =
      proposal.depositAmount ??
      computeDeposit(org.depositRules, proposal.survey.isResidential, agreed)
    if (!gross || gross <= 0) return

    const today = new Date().toISOString().slice(0, 10)
    const contactName = proposal.survey.clientCompany?.trim() || proposal.clientName
    const created = await xeroFetch(org, "/Invoices", {
      method: "POST",
      body: {
        Invoices: [
          {
            Type: "ACCREC",
            Contact: {
              Name: contactName,
              ...(proposal.clientEmail ? { EmailAddress: proposal.clientEmail } : {}),
            },
            Date: today,
            DueDate: today,
            Reference: `Deposit — ${proposal.survey.title}`.slice(0, 255),
            LineAmountTypes: "Inclusive",
            Status: "DRAFT",
            LineItems: [
              {
                Description:
                  `Deposit for ${proposal.survey.title}` +
                  (proposal.survey.clientAddress ? ` — ${proposal.survey.clientAddress}` : "") +
                  " (paid via SurvAIPro)",
                Quantity: 1,
                UnitAmount: gross,
                TaxType: "OUTPUT2",
              },
            ],
          },
        ],
      },
    })
    const inv = ((created.Invoices as Record<string, unknown>[] | undefined) || [])[0]
    if (inv?.InvoiceID) {
      await db.proposal.update({
        where: { id: proposalId },
        data: {
          xeroDepositInvoiceId: String(inv.InvoiceID),
          xeroDepositInvoiceNumber: inv.InvoiceNumber ? String(inv.InvoiceNumber) : null,
        },
      })
    }
  } catch (err) {
    console.error("Xero deposit invoice failed:", err)
  }
}
