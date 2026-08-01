import { NextRequest, NextResponse } from "next/server"
import { z } from "zod"
import { db } from "@/lib/db"
import { getCurrentUser } from "@/lib/session"
import { resetApprovalIfEdited } from "@/lib/permissions"
import { regenerateSection, friendlyAIError } from "@/lib/ai"

const updateSectionSchema = z.object({
  title: z.string().min(1).optional(),
  content: z.string().optional(),
  photoIds: z.array(z.string()).optional(),
})

async function scopedSection(sectionId: string, proposalId: string, organizationId: string) {
  return db.proposalSection.findFirst({
    where: { id: sectionId, proposalId, proposal: { organizationId } },
  })
}

export async function PATCH(
  request: NextRequest,
  { params }: { params: { proposalId: string; sectionId: string } }
) {
  const user = await getCurrentUser()
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  const section = await scopedSection(params.sectionId, params.proposalId, user.organizationId)
  if (!section) return NextResponse.json({ error: "Not found" }, { status: 404 })

  const body = await request.json()
  const parsed = updateSectionSchema.safeParse(body)
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.errors[0].message }, { status: 400 })
  }

  const { photoIds, ...rest } = parsed.data
  const updated = await db.proposalSection.update({
    where: { id: params.sectionId },
    data: {
      ...rest,
      ...(photoIds !== undefined && { photoIds: JSON.stringify(photoIds) }),
    },
  })

  const p = await db.proposal.findUnique({ where: { id: params.proposalId }, select: { approvalStatus: true } })
  if (p) await resetApprovalIfEdited(params.proposalId, user, p)

  return NextResponse.json(updated)
}

export async function DELETE(
  _request: NextRequest,
  { params }: { params: { proposalId: string; sectionId: string } }
) {
  const user = await getCurrentUser()
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  const section = await scopedSection(params.sectionId, params.proposalId, user.organizationId)
  if (!section) return NextResponse.json({ error: "Not found" }, { status: 404 })

  await db.proposalSection.delete({ where: { id: params.sectionId } })
  const p = await db.proposal.findUnique({ where: { id: params.proposalId }, select: { approvalStatus: true } })
  if (p) await resetApprovalIfEdited(params.proposalId, user, p)
  return NextResponse.json({ success: true })
}

// Regenerate this single section with AI
export async function POST(
  request: NextRequest,
  { params }: { params: { proposalId: string; sectionId: string } }
) {
  const user = await getCurrentUser()
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  const section = await scopedSection(params.sectionId, params.proposalId, user.organizationId)
  if (!section) return NextResponse.json({ error: "Not found" }, { status: 404 })

  const proposal = await db.proposal.findUniqueOrThrow({
    where: { id: params.proposalId },
    include: {
      survey: { include: { transcripts: { where: { approved: true } } } },
      organization: true,
    },
  })

  const body = await request.json().catch(() => ({}))
  const feedback = typeof body.feedback === "string" ? body.feedback : undefined

  const s = proposal.survey
  const context = `Job: ${s.title} (${s.serviceType}, ${s.isResidential ? "residential" : "commercial"})
Client: ${proposal.clientName}, site: ${s.clientAddress}
Survey description: ${s.writtenDescription || "none"}
Client priorities: ${s.clientPriorities || "none"}
Access notes: ${s.accessNotes || "none"}
Measurements: ${s.measurements || "none"}
Exclusions: ${s.exclusions || "none"}
Chemicals required: ${s.chemicalsRequired || "none"}
Water supply: ${s.waterSupply || "none"}
Approved transcripts: ${s.transcripts.map((t) => t.text).join(" | ") || "none"}`

  try {
    const content = await regenerateSection({
      sectionType: section.type,
      sectionTitle: section.title,
      currentContent: section.content,
      context,
      tone: proposal.organization.proposalTone,
      feedback,
    })

    const updated = await db.proposalSection.update({
      where: { id: section.id },
      data: { content },
    })

    return NextResponse.json(updated)
  } catch (error) {
    console.error("Section regeneration error:", error)
    return NextResponse.json(
      { error: friendlyAIError(error, "Regeneration failed. Please try again.") },
      { status: 500 }
    )
  }
}
