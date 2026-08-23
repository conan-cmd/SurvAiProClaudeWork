import "server-only"
import { db } from "@/lib/db"
import { encryptSecret, decryptSecret } from "@/lib/crypto"
import { calculateProposalTotals } from "@/lib/utils"
import { publicBaseUrl } from "@/lib/public-url"

// Per-firm Pipedrive CRM integration. Two connection modes:
//  - OAuth (Marketplace install): access/refresh tokens + api_domain. Preferred.
//  - API token (private self-connect): api_token + company domain. Fallback.
// Best-effort throughout — a CRM hiccup never blocks the user's action.

// Everything pd()/sync need. `id` is required so refreshed OAuth tokens persist.
export type PdOrg = {
  id: string
  pipedriveApiToken: string | null
  pipedriveCompanyDomain: string | null
  pipedriveAccessToken: string | null
  pipedriveRefreshToken: string | null
  pipedriveTokenExpiresAt: Date | null
  pipedriveApiDomain: string | null
}

// Columns to select whenever you need to call Pipedrive for an org.
export const PIPEDRIVE_SELECT = {
  id: true,
  pipedriveApiToken: true,
  pipedriveCompanyDomain: true,
  pipedriveAccessToken: true,
  pipedriveRefreshToken: true,
  pipedriveTokenExpiresAt: true,
  pipedriveApiDomain: true,
} as const

const AUTH_BASE = "https://oauth.pipedrive.com"

export function oauthAvailable(): boolean {
  return Boolean(process.env.PIPEDRIVE_CLIENT_ID && process.env.PIPEDRIVE_CLIENT_SECRET)
}

export function pipedriveConfigured(org: {
  pipedriveApiToken?: string | null
  pipedriveCompanyDomain?: string | null
  pipedriveAccessToken?: string | null
  pipedriveApiDomain?: string | null
}): boolean {
  return Boolean(
    (org.pipedriveAccessToken && org.pipedriveApiDomain) ||
      (org.pipedriveApiToken && org.pipedriveCompanyDomain)
  )
}

function basicAuthHeader(): string {
  const id = process.env.PIPEDRIVE_CLIENT_ID || ""
  const secret = process.env.PIPEDRIVE_CLIENT_SECRET || ""
  return "Basic " + Buffer.from(`${id}:${secret}`).toString("base64")
}

// --- OAuth ---------------------------------------------------------------------

export function authorizeUrl(state: string, redirectUri: string): string {
  const params = new URLSearchParams({
    client_id: process.env.PIPEDRIVE_CLIENT_ID || "",
    redirect_uri: redirectUri,
    state,
  })
  return `${AUTH_BASE}/oauth/authorize?${params.toString()}`
}

type TokenResponse = {
  access_token: string
  refresh_token: string
  expires_in: number
  api_domain: string
}

export async function exchangeCodeForTokens(code: string, redirectUri: string): Promise<TokenResponse> {
  const res = await fetch(`${AUTH_BASE}/oauth/token`, {
    method: "POST",
    headers: { Authorization: basicAuthHeader(), "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ grant_type: "authorization_code", code, redirect_uri: redirectUri }),
    signal: AbortSignal.timeout(12000),
  })
  const json = (await res.json().catch(() => ({}))) as Partial<TokenResponse> & { error?: string }
  if (!res.ok || !json.access_token) throw new Error(json.error || `Pipedrive token exchange failed (${res.status})`)
  return json as TokenResponse
}

async function refreshTokens(refreshToken: string): Promise<Omit<TokenResponse, "api_domain"> & { api_domain?: string }> {
  const res = await fetch(`${AUTH_BASE}/oauth/token`, {
    method: "POST",
    headers: { Authorization: basicAuthHeader(), "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ grant_type: "refresh_token", refresh_token: refreshToken }),
    signal: AbortSignal.timeout(12000),
  })
  const json = (await res.json().catch(() => ({}))) as Partial<TokenResponse> & { error?: string }
  if (!res.ok || !json.access_token) throw new Error(json.error || `Pipedrive token refresh failed (${res.status})`)
  return json as TokenResponse
}

// Returns a valid access token + api base, refreshing (and persisting) if expired.
async function oauthContext(org: PdOrg): Promise<{ token: string; apiBase: string } | null> {
  if (!org.pipedriveAccessToken || !org.pipedriveApiDomain) return null
  let token = decryptSecret(org.pipedriveAccessToken)
  const expiresAt = org.pipedriveTokenExpiresAt?.getTime() ?? 0
  // Refresh a minute before expiry.
  if (expiresAt - Date.now() < 60_000 && org.pipedriveRefreshToken) {
    const refreshed = await refreshTokens(decryptSecret(org.pipedriveRefreshToken))
    token = refreshed.access_token
    await db.organization.update({
      where: { id: org.id },
      data: {
        pipedriveAccessToken: encryptSecret(refreshed.access_token),
        pipedriveRefreshToken: encryptSecret(refreshed.refresh_token),
        pipedriveTokenExpiresAt: new Date(Date.now() + refreshed.expires_in * 1000),
        ...(refreshed.api_domain ? { pipedriveApiDomain: refreshed.api_domain } : {}),
      },
    })
  }
  return { token, apiBase: `${org.pipedriveApiDomain}/api/v1` }
}

// --- API call (OAuth first, token fallback) ------------------------------------

async function pd(
  org: PdOrg,
  path: string,
  opts?: { method?: string; body?: Record<string, unknown> }
): Promise<Record<string, unknown> | null> {
  const oauth = await oauthContext(org)
  let url: string
  const headers: Record<string, string> = {}
  if (oauth) {
    headers.Authorization = `Bearer ${oauth.token}`
    url = `${oauth.apiBase}${path}`
  } else if (org.pipedriveApiToken && org.pipedriveCompanyDomain) {
    const apiToken = decryptSecret(org.pipedriveApiToken)
    const sep = path.includes("?") ? "&" : "?"
    url = `https://${org.pipedriveCompanyDomain}.pipedrive.com/api/v1${path}${sep}api_token=${encodeURIComponent(apiToken)}`
  } else {
    throw new Error("Pipedrive not connected")
  }
  if (opts?.body) headers["Content-Type"] = "application/json"

  const res = await fetch(url, {
    method: opts?.method || "GET",
    headers,
    body: opts?.body ? JSON.stringify(opts.body) : undefined,
    signal: AbortSignal.timeout(12000),
  })
  const json = (await res.json().catch(() => ({}))) as { success?: boolean; data?: unknown; error?: string }
  if (!res.ok || json.success === false) throw new Error(json.error || `Pipedrive returned ${res.status}`)
  return (json.data ?? null) as Record<string, unknown> | null
}

// Validates an API token + domain (private mode) via /users/me.
export async function pipedriveTest(token: string, domain: string): Promise<{ name: string }> {
  const res = await fetch(`https://${domain}.pipedrive.com/api/v1/users/me?api_token=${encodeURIComponent(token)}`, {
    signal: AbortSignal.timeout(12000),
  })
  const json = (await res.json().catch(() => ({}))) as { data?: { name?: string }; error?: string }
  if (!res.ok || !json.data) throw new Error(json.error || "Couldn't connect — check the API token and company domain.")
  return { name: json.data.name || "Pipedrive" }
}

export type PdPerson = { id: number; name: string; email: string; phone: string; company: string }

export async function searchPersons(org: PdOrg, term: string): Promise<PdPerson[]> {
  if (!term.trim()) return []
  const data = await pd(org, `/persons/search?term=${encodeURIComponent(term)}&fields=name,email,phone&limit=10`)
  const items = ((data as { items?: unknown[] } | null)?.items || []) as Array<{
    item: { id: number; name: string; primary_email?: string; phones?: string[]; organization?: { name?: string } | null }
  }>
  return items.map((i) => ({
    id: i.item.id,
    name: i.item.name || "",
    email: i.item.primary_email || "",
    phone: i.item.phones?.[0] || "",
    company: i.item.organization?.name || "",
  }))
}

function dealStatusFor(status: string): "open" | "won" | "lost" {
  if (["SIGNED", "DEPOSIT_PAID", "WON"].includes(status)) return "won"
  if (status === "LOST") return "lost"
  return "open"
}

// Creates/updates the Pipedrive person + organization + deal for a proposal.
export async function syncProposalToPipedrive(proposalId: string): Promise<void> {
  const proposal = await db.proposal.findUnique({
    where: { id: proposalId },
    include: {
      organization: { select: PIPEDRIVE_SELECT },
      survey: { select: { title: true, clientCompany: true, clientEmail: true, clientPhone: true } },
      pricingLineItems: true,
    },
  })
  if (!proposal) return
  const org = proposal.organization
  if (!pipedriveConfigured(org)) return

  try {
    let orgId = proposal.pipedriveOrgId ? Number(proposal.pipedriveOrgId) : null
    if (!orgId && proposal.survey.clientCompany?.trim()) {
      const created = await pd(org, "/organizations", { method: "POST", body: { name: proposal.survey.clientCompany.trim() } })
      orgId = (created as { id?: number } | null)?.id ?? null
    }

    let personId = proposal.pipedrivePersonId ? Number(proposal.pipedrivePersonId) : null
    if (!personId) {
      const body: Record<string, unknown> = { name: proposal.clientName }
      if (proposal.survey.clientEmail) body.email = [proposal.survey.clientEmail]
      if (proposal.survey.clientPhone) body.phone = [proposal.survey.clientPhone]
      if (orgId) body.org_id = orgId
      const created = await pd(org, "/persons", { method: "POST", body })
      personId = (created as { id?: number } | null)?.id ?? null
    }

    const value = calculateProposalTotals(proposal.pricingLineItems).total
    const status = dealStatusFor(proposal.status)
    let dealId = proposal.pipedriveDealId ? Number(proposal.pipedriveDealId) : null
    if (!dealId) {
      const body: Record<string, unknown> = {
        title: proposal.survey.title || `Proposal — ${proposal.clientName}`,
        value,
        currency: "GBP",
        status,
      }
      if (personId) body.person_id = personId
      if (orgId) body.org_id = orgId
      const created = await pd(org, "/deals", { method: "POST", body })
      dealId = (created as { id?: number } | null)?.id ?? null
      if (dealId) {
        const link = `${publicBaseUrl("")}/proposals/${proposal.id}`
        await pd(org, "/notes", {
          method: "POST",
          body: { deal_id: dealId, content: `SurvAIPro proposal: <a href="${link}">${proposal.survey.title || "View proposal"}</a>` },
        }).catch(() => {})
      }
    } else {
      await pd(org, `/deals/${dealId}`, { method: "PUT", body: { value, status } })
    }

    await db.proposal.update({
      where: { id: proposalId },
      data: {
        pipedriveDealId: dealId ? String(dealId) : null,
        pipedrivePersonId: personId ? String(personId) : null,
        pipedriveOrgId: orgId ? String(orgId) : null,
      },
    })
  } catch (err) {
    console.error("Pipedrive sync failed:", err)
  }
}

export type PdDeal = {
  id: number
  title: string
  value: number
  currency: string
  status: string
  personName: string
  orgName: string
}

export async function searchDeals(org: PdOrg, term: string): Promise<PdDeal[]> {
  if (!term.trim()) return []
  const data = await pd(org, `/deals/search?term=${encodeURIComponent(term)}&fields=title&limit=15`)
  const items = ((data as { items?: unknown[] } | null)?.items || []) as Array<{
    item: {
      id: number; title?: string; value?: number; currency?: string; status?: string
      person?: { name?: string } | null
      organization?: { name?: string } | null
    }
  }>
  return items.map((i) => ({
    id: i.item.id,
    title: i.item.title || `Deal ${i.item.id}`,
    value: i.item.value || 0,
    currency: i.item.currency || "GBP",
    status: i.item.status || "open",
    personName: i.item.person?.name || "",
    orgName: i.item.organization?.name || "",
  }))
}

// Pipedrive represents person_id/org_id as either a bare id or {value} object.
function pdRefId(v: unknown): string | null {
  if (v == null) return null
  if (typeof v === "number") return String(v)
  const val = (v as { value?: number }).value
  return val != null ? String(val) : null
}

// Attach a proposal to an EXISTING Pipedrive deal: store the deal (and its
// person/org) on the proposal, pin a link-back note on the deal, then sync so
// value/status update that deal instead of a fresh one being created.
export async function linkProposalToDeal(proposalId: string, dealId: number): Promise<void> {
  const proposal = await db.proposal.findUnique({
    where: { id: proposalId },
    include: {
      organization: { select: PIPEDRIVE_SELECT },
      survey: { select: { title: true } },
    },
  })
  if (!proposal) throw new Error("Proposal not found")
  const org = proposal.organization
  if (!pipedriveConfigured(org)) throw new Error("Pipedrive isn't connected")

  const deal = await pd(org, `/deals/${dealId}`)
  if (!deal) throw new Error("That deal wasn't found in Pipedrive")
  const d = deal as { id?: number; person_id?: unknown; org_id?: unknown }

  await db.proposal.update({
    where: { id: proposalId },
    data: {
      pipedriveDealId: String(d.id ?? dealId),
      pipedrivePersonId: pdRefId(d.person_id),
      pipedriveOrgId: pdRefId(d.org_id),
    },
  })

  const link = `${publicBaseUrl("")}/proposals/${proposalId}`
  await pd(org, "/notes", {
    method: "POST",
    body: {
      deal_id: dealId,
      content: `SurvAIPro proposal: <a href="${link}">${proposal.survey.title || "View proposal"}</a>`,
    },
  }).catch(() => {})

  await syncProposalToPipedrive(proposalId)
}

export async function unlinkProposalDeal(proposalId: string): Promise<void> {
  await db.proposal.update({
    where: { id: proposalId },
    data: { pipedriveDealId: null, pipedrivePersonId: null, pipedriveOrgId: null },
  })
}

type RawDeal = {
  id: number
  title?: string
  value?: number
  currency?: string
  status?: string
  person_id?: { name?: string } | null
  org_id?: { name?: string } | null
}

function mapRawDeal(d: RawDeal): PdDeal {
  return {
    id: d.id,
    title: d.title || `Deal ${d.id}`,
    value: d.value || 0,
    currency: d.currency || "GBP",
    status: d.status || "open",
    personName: d.person_id?.name || "",
    orgName: d.org_id?.name || "",
  }
}

// Deal titles rarely contain the client's name — so match via the PERSON:
// find Pipedrive persons by the client's email (strongest key) or name, then
// list each person's deals. Open deals sort first.
export async function suggestDealsForClient(
  org: PdOrg,
  name: string,
  email?: string | null
): Promise<PdDeal[]> {
  const personIds: number[] = []
  for (const term of [email?.trim(), name.trim()].filter((t): t is string => !!t && t.length >= 2)) {
    try {
      const data = await pd(org, `/persons/search?term=${encodeURIComponent(term)}&fields=name,email&limit=5`)
      const items = ((data as { items?: unknown[] } | null)?.items || []) as Array<{ item: { id: number } }>
      for (const i of items) if (!personIds.includes(i.item.id)) personIds.push(i.item.id)
    } catch {
      // One bad search term shouldn't kill the suggestions.
    }
    if (personIds.length >= 5) break
  }

  const deals: PdDeal[] = []
  const seen = new Set<number>()
  for (const pid of personIds.slice(0, 5)) {
    try {
      const data = await pd(org, `/persons/${pid}/deals?status=all_not_deleted&limit=10`)
      for (const d of ((data as unknown as RawDeal[] | null) || [])) {
        if (!seen.has(d.id)) {
          seen.add(d.id)
          deals.push(mapRawDeal(d))
        }
      }
    } catch {
      // Person with no deals endpoint hiccup — skip.
    }
  }
  return deals
    .sort((a, b) =>
      (a.status === "open" ? 0 : 1) - (b.status === "open" ? 0 : 1) || b.id - a.id
    )
    .slice(0, 15)
}

// Newest open deals — the pick-from-a-list fallback when nothing matches.
export async function recentOpenDeals(org: PdOrg): Promise<PdDeal[]> {
  const data = await pd(org, `/deals?status=open&sort=${encodeURIComponent("update_time DESC")}&limit=15`)
  return (((data as unknown as RawDeal[] | null) || [])).map(mapRawDeal)
}

export type PdDealPrefill = {
  dealId: number
  title: string
  clientName: string
  clientCompany: string
  clientEmail: string
  clientPhone: string
  clientAddress: string
  // From a custom deal field like "Property type: Residential/Commercial".
  // null = no such field / unrecognised value — leave the form's default alone.
  isResidential: boolean | null
}

type PdFieldDef = {
  key: string
  name: string
  field_type: string
  options?: { id: number | string; label: string }[]
}

// Custom deal fields appear in the deal object under 40-char hash keys; the
// /dealFields catalogue maps those keys to human names and option labels.
async function dealFieldDefs(org: PdOrg): Promise<PdFieldDef[]> {
  try {
    const data = await pd(org, `/dealFields?limit=500`)
    return ((data as unknown as PdFieldDef[] | null) || [])
  } catch {
    return []
  }
}

// Everything Pipedrive knows about a deal that a new survey can start from:
// deal title + the person's contact details + the organisation (and its
// address, fetched separately since the deal embeds only the org name).
export async function dealPrefill(org: PdOrg, dealId: number): Promise<PdDealPrefill> {
  const deal = await pd(org, `/deals/${dealId}`)
  if (!deal) throw new Error("Deal not found in Pipedrive")
  const d = deal as {
    id?: number
    title?: string
    person_id?: {
      value?: number
      name?: string
      email?: { value?: string; primary?: boolean }[]
      phone?: { value?: string; primary?: boolean }[]
    } | null
    org_id?: { value?: number; name?: string; address?: string } | null
  }
  const primary = (arr?: { value?: string; primary?: boolean }[]) =>
    arr?.find((x) => x.primary)?.value || arr?.[0]?.value || ""

  // Custom deal fields: read via the field catalogue so we can find fields by
  // their human name ("Site address", "Property type", …) whatever the key.
  const raw = deal as Record<string, unknown>
  const fields = await dealFieldDefs(org)
  const fieldValue = (f: PdFieldDef): string => {
    const v = raw[f.key]
    if (v == null || v === "") return ""
    if (f.field_type === "enum" || f.field_type === "set") {
      const label = (id: unknown) => f.options?.find((o) => String(o.id) === String(id))?.label || ""
      return String(v).split(",").map(label).filter(Boolean).join(", ")
    }
    if (typeof v === "object") return String((v as { value?: unknown }).value ?? "")
    return String(v)
  }

  // Address, most specific first: a deal field named like an address, then the
  // organisation's Address, then the person's postal address.
  const addrField = fields.find((f) => /address|location/i.test(f.name) && !/email/i.test(f.name) && fieldValue(f))
  let address = (addrField && fieldValue(addrField)) || d.org_id?.address || ""
  if (!address && d.org_id?.value) {
    try {
      const o = await pd(org, `/organizations/${d.org_id.value}`)
      address = ((o as { address?: string } | null)?.address) || ""
    } catch {
      // Address is a nice-to-have; the survey form asks for it anyway.
    }
  }
  if (!address && d.person_id?.value) {
    try {
      const p = await pd(org, `/persons/${d.person_id.value}`)
      address = ((p as { postal_address?: string } | null)?.postal_address) || ""
    } catch {
      // Same — best effort.
    }
  }

  // Residential vs commercial from a deal field named along those lines.
  let isResidential: boolean | null = null
  const propField = fields.find(
    (f) => /property|residential|commercial|premises|sector|client type/i.test(f.name) && fieldValue(f)
  )
  if (propField) {
    const val = fieldValue(propField).toLowerCase()
    if (/commercial|business|b2b/.test(val)) isResidential = false
    else if (/residential|domestic|home/.test(val)) isResidential = true
  }

  return {
    dealId: d.id ?? dealId,
    title: d.title || "",
    clientName: d.person_id?.name || "",
    clientCompany: d.org_id?.name || "",
    clientEmail: primary(d.person_id?.email),
    clientPhone: primary(d.person_id?.phone),
    clientAddress: address,
    isResidential,
  }
}
