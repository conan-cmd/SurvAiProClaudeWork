import { NextRequest, NextResponse } from "next/server"
import { db } from "@/lib/db"

// Crew-facing works order data (no login — via the "wo-" prefixed share
// token). Includes internal detail the client never sees; the prefix check is
// what keeps client proposal tokens out of here.
export async function GET(_request: NextRequest, { params }: { params: { token: string } }) {
  if (!params.token.startsWith("wo-")) {
    return NextResponse.json({ error: "Not found" }, { status: 404 })
  }

  const link = await db.shareLink.findUnique({
    where: { token: params.token },
    include: {
      proposal: {
        include: {
          pricingLineItems: { orderBy: { order: "asc" } },
          organization: {
            select: { name: true, logoUrl: true, brandColor: true, secondaryColor: true, phone: true, email: true },
          },
          survey: {
            select: {
              title: true,
              clientAddress: true,
              what3words: true,
              accessNotes: true,
              waterSupply: true,
              chemicalsRequired: true,
              measurements: true,
              exclusions: true,
              areaSqm: true,
              linearMeters: true,
              photos: {
                orderBy: { order: "asc" },
                select: { id: true, fileUrl: true, caption: true, internalOnly: true },
              },
            },
          },
        },
      },
    },
  })
  if (!link || link.revoked) return NextResponse.json({ error: "Not found" }, { status: 404 })

  const p = link.proposal
  let selectedOptionalIds: string[] = []
  try {
    selectedOptionalIds = p.selectedOptionalIds ? JSON.parse(p.selectedOptionalIds) : []
  } catch {
    selectedOptionalIds = []
  }

  return NextResponse.json({
    clientName: p.clientName,
    status: p.status,
    signedAt: p.signedAt,
    signedName: p.signedName,
    lineItems: p.pricingLineItems.map((i) => ({
      id: i.id,
      description: i.description,
      quantity: i.quantity,
      unit: i.unit,
      isOptional: i.isOptional,
      selected: !i.isOptional || selectedOptionalIds.includes(i.id),
    })),
    survey: p.survey,
    organization: p.organization,
  })
}
