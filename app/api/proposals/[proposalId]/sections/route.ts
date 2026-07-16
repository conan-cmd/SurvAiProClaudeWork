import { NextRequest, NextResponse } from "next/server"
import { z } from "zod"
import { db } from "@/lib/db"
import { getCurrentUser } from "@/lib/session"

const createSectionSchema = z.object({
  type: z.string().default("custom"),
  title: z.string().min(1),
  content: z.string().default(""),
  order: z.number().int().min(0),
})

const reorderSchema = z.object({
  sectionIds: z.array(z.string()).min(1),
})

async function scopedProposal(proposalId: string, organizationId: string) {
  return db.proposal.findFirst({ where: { id: proposalId, organizationId } })
}

// Add a section
export async function POST(
  request: NextRequest,
  { params }: { params: { proposalId: string } }
) {
  const user = await getCurrentUser()
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  const proposal = await scopedProposal(params.proposalId, user.organizationId)
  if (!proposal) return NextResponse.json({ error: "Not found" }, { status: 404 })

  const body = await request.json()
  const parsed = createSectionSchema.safeParse(body)
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.errors[0].message }, { status: 400 })
  }

  const section = await db.proposalSection.create({
    data: { ...parsed.data, proposalId: proposal.id },
  })

  return NextResponse.json(section, { status: 201 })
}

// Reorder sections
export async function PATCH(
  request: NextRequest,
  { params }: { params: { proposalId: string } }
) {
  const user = await getCurrentUser()
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  const proposal = await scopedProposal(params.proposalId, user.organizationId)
  if (!proposal) return NextResponse.json({ error: "Not found" }, { status: 404 })

  const body = await request.json()
  const parsed = reorderSchema.safeParse(body)
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.errors[0].message }, { status: 400 })
  }

  await db.$transaction(
    parsed.data.sectionIds.map((id, index) =>
      db.proposalSection.updateMany({
        where: { id, proposalId: proposal.id },
        data: { order: index },
      })
    )
  )

  const sections = await db.proposalSection.findMany({
    where: { proposalId: proposal.id },
    orderBy: { order: "asc" },
  })

  return NextResponse.json(sections)
}
