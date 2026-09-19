import { NextRequest, NextResponse } from "next/server"
import crypto from "crypto"
import { db } from "@/lib/db"
import { webhookSig } from "@/lib/pipedrive"

// Pipedrive → SurvAIPro: deal status changes flow back, so a deal marked won
// or lost in Pipedrive updates the linked proposal here too. Registered per
// connection by ensureDealStatusWebhook; the sig in the URL ties it to the org.
// We never call the Pipedrive sync from here, so pushes can't loop.
export async function POST(request: NextRequest) {
  const orgId = request.nextUrl.searchParams.get("org") || ""
  const sig = request.nextUrl.searchParams.get("sig") || ""
  const expected = webhookSig(orgId)
  const a = Buffer.from(sig)
  const b = Buffer.from(expected)
  if (!orgId || a.length !== b.length || !crypto.timingSafeEqual(a, b)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }

  const body = (await request.json().catch(() => null)) as {
    current?: { id?: number; status?: string } | null
    data?: { id?: number; status?: string } | null
  } | null
  // v1 webhook payloads carry the deal in `current`; v2 in `data`.
  const deal = body?.current ?? body?.data
  const dealId = deal?.id
  const status = typeof deal?.status === "string" ? deal.status : null
  if (!dealId || !status) return NextResponse.json({ ok: true })

  const proposal = await db.proposal.findFirst({
    where: { organizationId: orgId, pipedriveDealId: String(dealId) },
    select: { id: true, status: true, signedAt: true, wonAt: true },
  })
  if (!proposal) return NextResponse.json({ ok: true })

  // Mirror decisive outcomes only, and never contradict a signed proposal.
  if (status === "won" && !["SIGNED", "DEPOSIT_PAID", "WON"].includes(proposal.status)) {
    await db.proposal.update({
      where: { id: proposal.id },
      data: { status: "WON", ...(proposal.wonAt ? {} : { wonAt: new Date() }) },
    })
  } else if (status === "lost" && proposal.status !== "LOST" && !proposal.signedAt) {
    await db.proposal.update({
      where: { id: proposal.id },
      data: { status: "LOST", wonAt: null },
    })
  }

  return NextResponse.json({ ok: true })
}
