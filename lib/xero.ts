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
  // Granular scopes (apps created after 2 Mar 2026 can't use the old broad
  // accounting.transactions): invoices to raise drafts, contacts to
  // match/create the customer. Do NOT request app.connections — it's a
  // client-credentials-only scope and Xero instantly access_denies it for
  // uncertified apps; GET /connections works with an ordinary token.
  const scope = ["offline_access", "accounting.invoices", "accounting.contacts"]
    .map(encodeURIComponent)
    .join("%20")
  return (
    `${AUTH_BASE}?response_type=code` +
    `&client_id=${encodeURIComponent(process.env.XERO_CLIENT_ID || "")}` +
    `&redirect_uri=${encodeURIComponent(redirectUri)}` +
    `&scope=${scope}` +
    `&state=${encodeURIComponent(state)}`
  )
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

export type DepositInvoiceResult =
  | { status: "created" | "exists"; invoiceNumber: string | null; balanceInvoiceNumber?: string | null }
  | { status: "skipped"; reason: "not_connected" | "no_deposit" }
  | { status: "error"; message: string }

// Raise the DRAFT deposit invoice for a just-paid proposal, plus a DRAFT
// remaining-balance invoice for the rest of the job (approved by the office
// on completion — drafts carry no tax point, so the VAT timing stays right).
// Idempotent — stored invoice ids mean they already exist; a proposal with a
// deposit invoice but no balance invoice gets the balance backfilled.
// Amounts are VAT-inclusive (the deposit is charged on the gross agreed
// total), so lines use Inclusive with UK 20% output VAT for Xero to back the
// VAT out correctly. Never throws — the result says what happened so callers
// can surface or ignore it.
export async function createDepositInvoice(proposalId: string): Promise<DepositInvoiceResult> {
  try {
    const proposal = await db.proposal.findUnique({
      where: { id: proposalId },
      include: {
        organization: { select: { ...XERO_SELECT, depositRules: true } },
        survey: { select: { title: true, clientAddress: true, clientCompany: true, isResidential: true } },
        pricingLineItems: true,
      },
    })
    if (!proposal) return { status: "error", message: "Proposal not found" }
    const org = proposal.organization
    if (!xeroAvailable() || !xeroConnected(org)) return { status: "skipped", reason: "not_connected" }

    const { calculateProposalTotals, formatCurrency } = await import("@/lib/utils")
    const agreed = proposal.agreedTotal ?? calculateProposalTotals(proposal.pricingLineItems).total
    const gross =
      proposal.depositAmount ??
      computeDeposit(org.depositRules, proposal.survey.isResidential, agreed)
    if (!gross || gross <= 0) return { status: "skipped", reason: "no_deposit" }

    const today = new Date().toISOString().slice(0, 10)
    const jobLabel =
      proposal.survey.title +
      (proposal.survey.clientAddress ? ` — ${proposal.survey.clientAddress}` : "")
    const totalStr = `${formatCurrency(agreed)} inc VAT`
    const contact = {
      Name: proposal.survey.clientCompany?.trim() || proposal.clientName,
      ...(proposal.clientEmail ? { EmailAddress: proposal.clientEmail } : {}),
    }

    let depositId = proposal.xeroDepositInvoiceId
    let invoiceNumber = proposal.xeroDepositInvoiceNumber

    if (!depositId) {
      // "Deposit (50% of total job value £3,600.00 inc VAT)" when the split is
      // a clean percentage; a fixed-amount deposit just shows both figures.
      const pctRaw = (gross / agreed) * 100
      const pct = Math.abs(pctRaw - Math.round(pctRaw)) < 0.05 ? `${Math.round(pctRaw)}% of ` : ""
      const created = await xeroFetch(org, "/Invoices", {
        method: "POST",
        body: {
          Invoices: [
            {
              Type: "ACCREC",
              Contact: contact,
              Date: today,
              DueDate: today,
              Reference: `Deposit — ${proposal.survey.title}`.slice(0, 255),
              LineAmountTypes: "Inclusive",
              Status: "DRAFT",
              LineItems: [
                {
                  Description: `Deposit (${pct}total job value ${totalStr}) — ${jobLabel} (paid via SurvAIPro)`,
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
      if (!inv?.InvoiceID) return { status: "error", message: "Xero returned no invoice" }
      depositId = String(inv.InvoiceID)
      invoiceNumber = inv.InvoiceNumber ? String(inv.InvoiceNumber) : null
      await db.proposal.update({
        where: { id: proposalId },
        data: { xeroDepositInvoiceId: depositId, xeroDepositInvoiceNumber: invoiceNumber },
      })
    }

    // Companion DRAFT invoice for the remaining balance, tied back to the
    // deposit. Xero only assigns draft numbers on approval, so the deposit
    // invoice number is quoted when known and the amounts + paid date are
    // always baked in. Best-effort: a balance failure never undoes the
    // deposit invoice.
    let balanceInvoiceNumber = proposal.xeroBalanceInvoiceNumber
    const balance = Math.round((agreed - gross) * 100) / 100
    if (!proposal.xeroBalanceInvoiceId && balance > 0) {
      try {
        const paidOn = (proposal.depositPaidAt ?? new Date()).toLocaleDateString("en-GB", {
          day: "numeric", month: "short", year: "numeric",
        })
        const re = invoiceNumber ? ` (deposit invoice ${invoiceNumber})` : ""
        const dueDate = new Date(Date.now() + 30 * 86400_000).toISOString().slice(0, 10)
        const created = await xeroFetch(org, "/Invoices", {
          method: "POST",
          body: {
            Invoices: [
              {
                Type: "ACCREC",
                Contact: contact,
                Date: today,
                DueDate: dueDate,
                Reference: `Balance — ${proposal.survey.title}${re}`.slice(0, 255),
                LineAmountTypes: "Inclusive",
                Status: "DRAFT",
                LineItems: [
                  {
                    Description:
                      `Remaining balance — ${jobLabel}. ` +
                      `Total job value ${totalStr}, less deposit ${formatCurrency(gross)} ` +
                      `paid ${paidOn} via SurvAIPro${re}.`,
                    Quantity: 1,
                    UnitAmount: balance,
                    TaxType: "OUTPUT2",
                  },
                ],
              },
            ],
          },
        })
        const inv = ((created.Invoices as Record<string, unknown>[] | undefined) || [])[0]
        if (inv?.InvoiceID) {
          balanceInvoiceNumber = inv.InvoiceNumber ? String(inv.InvoiceNumber) : null
          await db.proposal.update({
            where: { id: proposalId },
            data: {
              xeroBalanceInvoiceId: String(inv.InvoiceID),
              xeroBalanceInvoiceNumber: balanceInvoiceNumber,
            },
          })
        }
      } catch (err) {
        console.error("Xero balance invoice failed:", err)
      }
    }

    return {
      status: proposal.xeroDepositInvoiceId ? "exists" : "created",
      invoiceNumber,
      balanceInvoiceNumber,
    }
  } catch (err) {
    console.error("Xero deposit invoice failed:", err)
    return { status: "error", message: err instanceof Error ? err.message : "Unexpected error" }
  }
}
