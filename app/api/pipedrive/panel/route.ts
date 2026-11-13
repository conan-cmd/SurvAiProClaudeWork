import { NextRequest, NextResponse } from "next/server"
import crypto from "crypto"
import { db } from "@/lib/db"
import { publicBaseUrl } from "@/lib/public-url"
import { calculateProposalTotals, formatCurrency } from "@/lib/utils"

// Pipedrive JSON panel: shown on the deal detail view, rendered by Pipedrive
// from this endpoint's response. Requests carry a JWT signed with the app's
// client secret (or the panel's JWT secret if one was set in Developer Hub);
// its company_id tells us which organisation's data to serve.

function verifyJwt(token: string, secrets: string[]): Record<string, unknown> | null {
  const parts = token.split(".")
  if (parts.length !== 3) return null
  for (const secret of secrets) {
    if (!secret) continue
    const expected = crypto.createHmac("sha256", secret).update(`${parts[0]}.${parts[1]}`).digest("base64url")
    const a = Buffer.from(parts[2])
    const b = Buffer.from(expected)
    if (a.length === b.length && crypto.timingSafeEqual(a, b)) {
      try {
        const payload = JSON.parse(Buffer.from(parts[1], "base64url").toString()) as Record<string, unknown>
        const exp = typeof payload.exp === "number" ? payload.exp : null
        if (exp && Date.now() / 1000 > exp) return null
        return payload
      } catch {
        return null
      }
    }
  }
  return null
}

// Pipedrive renders any non-200 as an unhelpful "Something went wrong", so
// configuration failures answer 200 with the problem spelled out in the panel
// fields themselves (no org data is exposed on these).
function panelMessage(dealId: string, header: string, detail: string) {
  return NextResponse.json({
    data: {
      id: Number(dealId) || 0,
      header,
      status: detail,
      quoted_net: "—",
      signed: "—",
      deposit: "—",
      client_views: "—",
    },
  })
}

export async function GET(request: NextRequest) {
  return handle(request)
}

// Pipedrive's panel fetches have changed verb between extension versions —
// answer POST identically rather than 405ing the panel into an error.
export async function POST(request: NextRequest) {
  return handle(request)
}

async function handle(request: NextRequest) {
  const auth = request.headers.get("authorization") || ""
  const token = auth.startsWith("Bearer ") ? auth.slice(7) : request.nextUrl.searchParams.get("token") || ""
  const dealId =
    request.nextUrl.searchParams.get("selectedIds")?.split(",")[0] ||
    request.nextUrl.searchParams.get("id") ||
    ""
  const hasSecrets = Boolean(process.env.PIPEDRIVE_PANEL_SECRET || process.env.PIPEDRIVE_CLIENT_SECRET)
  const payload = verifyJwt(token, [
    process.env.PIPEDRIVE_PANEL_SECRET || "",
    process.env.PIPEDRIVE_CLIENT_SECRET || "",
  ])
  if (!payload) {
    // Real Pipedrive panel requests always carry identifying query params;
    // anything without them is just a probe and gets a bare 401.
    const q = request.nextUrl.searchParams
    const looksLikePipedrive = Boolean(q.get("companyId") || q.get("selectedIds") || q.get("userId"))
    const authKind = auth.startsWith("Bearer ") ? "a Bearer token"
      : auth.startsWith("Basic ") ? "Basic auth credentials"
      : token ? "a token query parameter"
      : "no credentials"
    console.error("[pipedrive-panel] unverified request", {
      hasSecrets, authKind, looksLikePipedrive,
      queryKeys: [...q.keys()],
      tokenParts: token ? token.split(".").length : 0,
    })
    if (!looksLikePipedrive && !token) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    const remedy = !hasSecrets
      ? "set PIPEDRIVE_CLIENT_SECRET on Vercel and redeploy"
      : token
        ? "signature mismatch — re-copy the app's Client secret from Developer Hub into Vercel (PIPEDRIVE_CLIENT_SECRET), or set the panel's JWT secret to the same value"
        : "in Developer Hub, open the panel's settings and set its JWT secret (leave HTTP auth empty) so requests are signed"
    return panelMessage(dealId, "SurvAIPro® connection issue", `Pipedrive sent ${authKind} — ${remedy}`)
  }

  const companyId =
    payload.company_id != null ? String(payload.company_id) : request.nextUrl.searchParams.get("companyId")
  if (!companyId || !dealId) {
    return panelMessage(dealId, "SurvAIPro® connection issue", "Pipedrive sent no company/deal id — check the panel's URL settings in Developer Hub")
  }

  const org = await db.organization.findFirst({
    where: { pipedriveCompanyId: companyId },
    select: { id: true, depositRules: true },
  })
  const proposal = org
    ? await db.proposal.findFirst({
        where: { organizationId: org.id, pipedriveDealId: dealId },
        include: {
          pricingLineItems: true,
          survey: { select: { title: true, isResidential: true } },
          _count: { select: { views: true } },
          views: { select: { updatedAt: true }, orderBy: { updatedAt: "desc" }, take: 1 },
        },
      })
    : null

  if (!org) {
    console.error("[pipedrive-panel] no organization for Pipedrive company", { companyId })
    return panelMessage(dealId, "SurvAIPro® connection issue",
      "This Pipedrive account isn't linked to a SurvAIPro® organization — reconnect Pipedrive in Settings → Integrations")
  }
  const base = publicBaseUrl(request.nextUrl.origin)
  if (!proposal) {
    // Minimal schema-valid object: required fields only, so the unlinked path
    // has the least possible surface for Pipedrive's response validation.
    console.log("[pipedrive-panel] ok: no proposal linked to deal", { dealId })
    return NextResponse.json({
      data: {
        id: Number(dealId),
        header: "No SurvAIPro® proposal yet",
      },
    })
  }
  console.log("[pipedrive-panel] ok: serving linked proposal", { dealId, status: proposal.status })

  const totals = calculateProposalTotals(proposal.pricingLineItems)
  const lastView = proposal.views[0]?.updatedAt
  const statusLabel: Record<string, string> = {
    DRAFT: "Draft", READY: "Ready to send", SENT: "Sent", SIGNED: "Accepted & signed",
    DEPOSIT_PAID: "Deposit paid", WON: "Won", LOST: "Lost",
  }

  // Deposit line: paid beats due; nothing shows before the client signs.
  let deposit = "—"
  if (proposal.depositPaidAt) {
    deposit = `Paid${proposal.depositAmount ? ` ${formatCurrency(proposal.depositAmount)}` : ""} on ${proposal.depositPaidAt.toLocaleDateString("en-GB")}`
  } else if (proposal.signedAt) {
    const { computeDeposit } = await import("@/lib/stripe")
    const agreed = proposal.agreedTotal ?? totals.total
    const due = computeDeposit(org!.depositRules, proposal.survey.isResidential, agreed)
    deposit = due > 0 ? `Due ${formatCurrency(due)}` : "None due"
  }

  return NextResponse.json({
    data: {
      // Pipedrive's panel schema requires id + header on every response.
      id: Number(dealId),
      header: proposal.survey.title || "SurvAIPro® proposal",
      status: statusLabel[proposal.status] || proposal.status,
      quoted_net: `${formatCurrency(totals.subtotal)} + VAT`,
      signed: proposal.signedAt
        ? `Signed by ${proposal.signedName || proposal.clientName} on ${proposal.signedAt.toLocaleDateString("en-GB")}`
        : "Not signed",
      deposit,
      client_views: proposal._count.views > 0
        ? `${proposal._count.views}× — last ${lastView ? lastView.toLocaleDateString("en-GB") : ""}`
        : "Not opened yet",
      survaipro: {
        label: "Open this proposal in SurvAIPro®",
        value: `${base}/proposals/${proposal.id}`,
      },
    },
  })
}
