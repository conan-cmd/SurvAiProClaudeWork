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
  // Contractor markup (user-side only).
  markupType: z.enum(["NONE", "PERCENT", "FIXED"]).optional(),
  markupValue: z.number().min(0).nullable().optional(),
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
  if (parsed.data.status === "SENT" && existing.status !== "SENT") {
    data.sentAt = new Date()
  }

  const proposal = await db.proposal.update({
    where: { id: params.proposalId },
    data,
  })

  // Keep the Pipedrive deal's status in sync when the proposal status changes.
  if (parsed.data.status) {
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
