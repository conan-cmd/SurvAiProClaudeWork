import { NextRequest, NextResponse } from "next/server"
import { z } from "zod"
import { db } from "@/lib/db"
import { getCurrentUser } from "@/lib/session"
import { userCanSend, isApprover } from "@/lib/permissions"
import { resolveProposalIdentity } from "@/lib/proposal-identity"

const updateProposalSchema = z.object({
  status: z.enum(["DRAFT", "READY", "SENT", "SIGNED", "DEPOSIT_PAID", "WON", "LOST"]).optional(),
  templateName: z.string().optional(),
  clientName: z.string().optional(),
  clientEmail: z.string().email().optional().or(z.literal("")),
  // Per-proposal identity override. null clears it (inherit the org default).
  identityMode: z.enum(["CREATOR", "USER", "ORG"]).nullable().optional(),
  identityUserId: z.string().nullable().optional(),
  // Records a verbal / on-paper acceptance the client won't be signing digitally.
  markAccepted: z.boolean().optional(),
  // Pipeline board column; null returns the card to auto-bucketing.
  pipelineStageId: z.string().max(100).nullable().optional(),
})

export async function GET(
  _request: NextRequest,
  { params }: { params: { proposalId: string } }
) {
  const user = await getCurrentUser()
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  const proposal = await db.proposal.findFirst({
    where: { id: params.proposalId, organizationId: user.organizationId },
    include: {
      sections: { orderBy: { order: "asc" } },
      pricingLineItems: { orderBy: { order: "asc" } },
      survey: { include: { photos: { orderBy: { order: "asc" } } } },
      organization: {
        select: {
          id: true, name: true, logoUrl: true, brandColor: true, secondaryColor: true,
          email: true, phone: true, website: true, showCoordinatesOnProposal: true,
          signOffName: true, headshotUrl: true, signatureImageUrl: true,
          proposalIdentityMode: true, proposalIdentityUserId: true,
        },
      },
      createdBy: {
        select: { id: true, name: true, email: true, signOffName: true, headshotUrl: true, signatureImageUrl: true },
      },
      views: {
        select: { totalSeconds: true, sections: true, createdAt: true, updatedAt: true },
        orderBy: { updatedAt: "desc" },
      },
    },
  })

  if (!proposal) return NextResponse.json({ error: "Not found" }, { status: 404 })
  // Expose the caller's permissions so the editor can show the right controls.
  const me = { canSend: userCanSend(user), isApprover: isApprover(user), id: user.id }
  // The resolved "who represents this proposal" identity (email/headshot/signature).
  const identity = await resolveProposalIdentity(proposal)
  return NextResponse.json({ ...proposal, me, identity })
}

export async function PATCH(
  request: NextRequest,
  { params }: { params: { proposalId: string } }
) {
  const user = await getCurrentUser()
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  const existing = await db.proposal.findFirst({
    where: { id: params.proposalId, organizationId: user.organizationId },
  })
  if (!existing) return NextResponse.json({ error: "Not found" }, { status: 404 })

  const body = await request.json()
  const parsed = updateProposalSchema.safeParse(body)
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.errors[0].message }, { status: 400 })
  }

  const data: Record<string, unknown> = { ...parsed.data }
  delete data.markAccepted
  if (parsed.data.status === "SENT" && existing.status !== "SENT") {
    data.sentAt = new Date()
  }
  if (parsed.data.markAccepted) {
    if (existing.signedAt) {
      return NextResponse.json({ error: "This proposal is already accepted" }, { status: 409 })
    }
    // A verbal / on-paper yes is a WON deal — but NOT a signature. signedAt stays
    // null so the proposal honestly shows "Not signed" and the client can still
    // sign the paperwork digitally later (e.g. after a nudge).
    data.status = "WON"
  }
  // Keep the won date honest: stamp it the first time a deal reaches a won
  // stage, and clear it if the deal is moved back to an open stage or lost.
  const WON_STAGES = ["SIGNED", "DEPOSIT_PAID", "WON"]
  const nextStatus = data.status as string | undefined
  if (nextStatus) {
    if (WON_STAGES.includes(nextStatus) && !existing.wonAt) data.wonAt = new Date()
    if (!WON_STAGES.includes(nextStatus) && existing.wonAt) data.wonAt = null
  }

  const proposal = await db.proposal.update({
    where: { id: params.proposalId },
    data,
  })

  // Keep the Pipedrive deal's status in sync when the proposal status changes.
  if (parsed.data.status || parsed.data.markAccepted) {
    const { syncProposalToPipedrive } = await import("@/lib/pipedrive")
    await syncProposalToPipedrive(params.proposalId)
  }

  return NextResponse.json(proposal)
}

export async function DELETE(
  _request: NextRequest,
  { params }: { params: { proposalId: string } }
) {
  const user = await getCurrentUser()
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  const existing = await db.proposal.findFirst({
    where: { id: params.proposalId, organizationId: user.organizationId },
  })
  if (!existing) return NextResponse.json({ error: "Not found" }, { status: 404 })

  await db.proposal.delete({ where: { id: params.proposalId } })
  return NextResponse.json({ success: true })
}
