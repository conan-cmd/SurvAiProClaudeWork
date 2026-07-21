import { NextRequest, NextResponse } from "next/server"
import { z } from "zod"
import { db } from "@/lib/db"
import { calculateProposalTotals, lineGross } from "@/lib/utils"

const acceptSchema = z.object({
  name: z.string().min(2, "Please enter your full name"),
  position: z.string().max(100).optional(),
  company: z.string().max(150).optional(),
  signature: z.string().startsWith("data:image/").max(500_000),
  // IDs of optional line items the client ticked to include in their order
  selectedOptionalIds: z.array(z.string()).optional(),
})

// Public endpoint: the client accepts and signs via their secure share link.
export async function POST(
  request: NextRequest,
  { params }: { params: { token: string } }
) {
  const link = await db.shareLink.findUnique({
    where: { token: params.token },
    include: {
      proposal: {
        select: {
          id: true,
          status: true,
          signedAt: true,
          pricingLineItems: {
            select: {
              id: true, quantity: true, unitPrice: true,
              vat: true, discount: true, isOptional: true,
            },
          },
        },
      },
    },
  })
  if (!link || link.revoked || link.expiresAt < new Date()) {
    return NextResponse.json({ error: "This link is no longer valid" }, { status: 404 })
  }
  if (link.proposal.signedAt || link.proposal.status === "SIGNED" || link.proposal.status === "WON") {
    return NextResponse.json({ error: "This proposal has already been accepted" }, { status: 409 })
  }

  const parsed = acceptSchema.safeParse(await request.json())
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.errors[0].message }, { status: 400 })
  }

  // Recompute the agreed total server-side - never trust a total from the client.
  // Only optional items that actually belong to this proposal are honoured.
  const items = link.proposal.pricingLineItems
  const requestedIds = new Set(parsed.data.selectedOptionalIds ?? [])
  const chosenOptional = items.filter((i) => i.isOptional && requestedIds.has(i.id))
  const base = calculateProposalTotals(items).total
  const optionalsTotal = chosenOptional.reduce((sum, i) => sum + lineGross(i), 0)
  const agreedTotal = Math.round((base + optionalsTotal) * 100) / 100

  await db.proposal.update({
    where: { id: link.proposal.id },
    data: {
      status: "SIGNED",
      signedAt: new Date(),
      signedName: parsed.data.name,
      signedPosition: parsed.data.position || null,
      signedCompany: parsed.data.company || null,
      signatureImage: parsed.data.signature,
      selectedOptionalIds: chosenOptional.length
        ? JSON.stringify(chosenOptional.map((i) => i.id))
        : null,
      agreedTotal,
    },
  })

  return NextResponse.json({ success: true })
}
