import { NextRequest, NextResponse } from "next/server"
import { z } from "zod"
import { db } from "@/lib/db"
import { getCurrentUser } from "@/lib/session"

const updateProposalSchema = z.object({
  status: z.enum(["DRAFT", "READY", "SENT", "SIGNED", "DEPOSIT_PAID", "WON", "LOST"]).optional(),
  templateName: z.string().optional(),
  clientName: z.string().optional(),
  clientEmail: z.string().email().optional().or(z.literal("")),
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
          name: true, logoUrl: true, brandColor: true, secondaryColor: true,
          email: true, phone: true, website: true, showCoordinatesOnProposal: true,
          signOffName: true, headshotUrl: true, signatureImageUrl: true,
        },
      },
      createdBy: {
        select: { name: true, signOffName: true, headshotUrl: true, signatureImageUrl: true },
      },
      views: {
        select: { totalSeconds: true, sections: true, createdAt: true, updatedAt: true },
        orderBy: { updatedAt: "desc" },
      },
    },
  })

  if (!proposal) return NextResponse.json({ error: "Not found" }, { status: 404 })
  return NextResponse.json(proposal)
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
