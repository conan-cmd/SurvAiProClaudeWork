import "server-only"
import { db } from "@/lib/db"
import { decryptSecret } from "@/lib/crypto"
import { calculateProposalTotals } from "@/lib/utils"
import { publicBaseUrl } from "@/lib/public-url"

// Per-firm Pipedrive CRM integration. Each organisation connects its own account
// (API token + company domain). Best-effort throughout — a CRM hiccup never blocks
// the user's action.

type OrgCreds = { pipedriveApiToken: string | null; pipedriveCompanyDomain: string | null }

export function pipedriveConfigured(org: OrgCreds): boolean {
  return Boolean(org.pipedriveApiToken && org.pipedriveCompanyDomain)
}

function baseUrl(domain: string): string {
  return `https://${domain}.pipedrive.com/api/v1`
}

async function pd(
  org: OrgCreds,
  path: string,
  opts?: { method?: string; body?: Record<string, unknown> }
): Promise<Record<string, unknown> | null> {
  if (!org.pipedriveApiToken || !org.pipedriveCompanyDomain) throw new Error("Pipedrive not connected")
  const token = decryptSecret(org.pipedriveApiToken)
  const sep = path.includes("?") ? "&" : "?"
  const url = `${baseUrl(org.pipedriveCompanyDomain)}${path}${sep}api_token=${encodeURIComponent(token)}`
  const res = await fetch(url, {
    method: opts?.method || "GET",
    headers: opts?.body ? { "Content-Type": "application/json" } : {},
    body: opts?.body ? JSON.stringify(opts.body) : undefined,
    signal: AbortSignal.timeout(12000),
  })
  const json = (await res.json().catch(() => ({}))) as { success?: boolean; data?: unknown; error?: string }
  if (!res.ok || json.success === false) throw new Error(json.error || `Pipedrive returned ${res.status}`)
  return (json.data ?? null) as Record<string, unknown> | null
}

// Validates a token + domain by calling /users/me. Returns the connected user's name.
export async function pipedriveTest(token: string, domain: string): Promise<{ name: string }> {
  const res = await fetch(`${baseUrl(domain)}/users/me?api_token=${encodeURIComponent(token)}`, {
    signal: AbortSignal.timeout(12000),
  })
  const json = (await res.json().catch(() => ({}))) as { data?: { name?: string }; error?: string }
  if (!res.ok || !json.data) throw new Error(json.error || "Couldn't connect — check the API token and company domain.")
  return { name: json.data.name || "Pipedrive" }
}

export type PdPerson = { id: number; name: string; email: string; phone: string; company: string }

// Search persons by name/email/phone for the "import a contact" flow.
export async function searchPersons(org: OrgCreds, term: string): Promise<PdPerson[]> {
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

// Maps a proposal's status to a Pipedrive deal status.
function dealStatusFor(status: string): "open" | "won" | "lost" {
  if (["SIGNED", "DEPOSIT_PAID", "WON"].includes(status)) return "won"
  if (status === "LOST") return "lost"
  return "open"
}

// Creates or updates the Pipedrive person + organization + deal for a proposal and
// keeps the deal's value & status in sync. Safe to call repeatedly.
export async function syncProposalToPipedrive(proposalId: string): Promise<void> {
  const proposal = await db.proposal.findUnique({
    where: { id: proposalId },
    include: {
      organization: { select: { pipedriveApiToken: true, pipedriveCompanyDomain: true } },
      survey: { select: { title: true, clientCompany: true, clientEmail: true, clientPhone: true } },
      pricingLineItems: true,
    },
  })
  if (!proposal) return
  const org = proposal.organization
  if (!pipedriveConfigured(org)) return

  try {
    // 1) Organization (from the client's company name)
    let orgId = proposal.pipedriveOrgId ? Number(proposal.pipedriveOrgId) : null
    if (!orgId && proposal.survey.clientCompany?.trim()) {
      const created = await pd(org, "/organizations", { method: "POST", body: { name: proposal.survey.clientCompany.trim() } })
      orgId = (created as { id?: number } | null)?.id ?? null
    }

    // 2) Person (the client contact)
    let personId = proposal.pipedrivePersonId ? Number(proposal.pipedrivePersonId) : null
    if (!personId) {
      const body: Record<string, unknown> = { name: proposal.clientName }
      if (proposal.survey.clientEmail) body.email = [proposal.survey.clientEmail]
      if (proposal.survey.clientPhone) body.phone = [proposal.survey.clientPhone]
      if (orgId) body.org_id = orgId
      const created = await pd(org, "/persons", { method: "POST", body })
      personId = (created as { id?: number } | null)?.id ?? null
    }

    // 3) Deal (value = your own proposal total; status tracks the proposal)
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
      // Attach a note with a link back to the proposal (best-effort).
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
