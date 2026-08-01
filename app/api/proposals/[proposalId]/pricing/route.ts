import { NextRequest, NextResponse } from "next/server"
import { z } from "zod"
import { db } from "@/lib/db"
import { getCurrentUser } from "@/lib/session"
import { resetApprovalIfEdited } from "@/lib/permissions"

const lineItemSchema = z.object({
  id: z.string().optional(), // present = update, absent = create
  description: z.string().min(1),
  quantity: z.number().min(0),
  unit: z.string().default("each"),
  unitPrice: z.number().min(0),
  vat: z.number().min(0).max(100).default(20),
  discount: z.number().min(0).max(100).default(0),
  isOptional: z.boolean().default(false),
  order: z.number().int().min(0).default(0),
})

const replaceSchema = z.object({
  items: z.array(lineItemSchema),
})

// Replace-all semantics: the editor autosaves the whole pricing table.
export async function PUT(
  request: NextRequest,
  { params }: { params: { proposalId: string } }
) {
  const user = await getCurrentUser()
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  const proposal = await db.proposal.findFirst({
    where: { id: params.proposalId, organizationId: user.organizationId },
  })
  if (!proposal) return NextResponse.json({ error: "Not found" }, { status: 404 })

  const body = await request.json()
  const parsed = replaceSchema.safeParse(body)
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.errors[0].message }, { status: 400 })
  }

  const items = await db.$transaction(async (tx) => {
    await tx.pricingLineItem.deleteMany({ where: { proposalId: proposal.id } })
    await tx.pricingLineItem.createMany({
      data: parsed.data.items.map((item, index) => ({
        proposalId: proposal.id,
        description: item.description,
        quantity: item.quantity,
        unit: item.unit,
        unitPrice: item.unitPrice,
        vat: item.vat,
        discount: item.discount,
        isOptional: item.isOptional,
        order: index,
      })),
    })
    return tx.pricingLineItem.findMany({
      where: { proposalId: proposal.id },
      orderBy: { order: "asc" },
    })
  })

  await resetApprovalIfEdited(proposal.id, user, proposal)

  return NextResponse.json(items)
}
