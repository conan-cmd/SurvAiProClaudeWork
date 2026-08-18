import { NextRequest, NextResponse } from "next/server"
import { db } from "@/lib/db"
import { getCurrentUser } from "@/lib/session"
import { duplicateSurvey } from "@/lib/duplicate"

// Copies a proposal together with its survey (proposals are 1:1 with surveys)
// as a fresh unsent draft: content, pricing and settings carry over; send,
// signature, payment, nudge and share-link state intentionally don't.
export async function POST(
  _request: NextRequest,
  { params }: { params: { proposalId: string } }
) {
  const user = await getCurrentUser()
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  const source = await db.proposal.findFirst({
    where: { id: params.proposalId, organizationId: user.organizationId },
    include: {
      sections: { orderBy: { order: "asc" } },
      pricingLineItems: { orderBy: { order: "asc" } },
    },
  })
  if (!source) return NextResponse.json({ error: "Not found" }, { status: 404 })

  const survey = await duplicateSurvey(source.surveyId, user)
  if (!survey) return NextResponse.json({ error: "Not found" }, { status: 404 })

  // An explicit photo selection must point at the new survey's photo copies
  // (null = "all survey photos", which needs no remapping).
  const remapPhotoIds = (raw: string | null) => {
    if (!raw) return null
    try {
      const ids = JSON.parse(raw)
      if (!Array.isArray(ids)) return null
      return JSON.stringify(
        ids.map((pid) => survey.photoIdMap.get(pid)).filter(Boolean)
      )
    } catch {
      return null
    }
  }

  const copy = await db.proposal.create({
    data: {
      organizationId: user.organizationId,
      surveyId: survey.id,
      createdById: user.id,
      clientName: source.clientName,
      clientEmail: source.clientEmail,
      templateName: source.templateName,
      identityMode: source.identityMode,
      identityUserId: source.identityUserId,
      markupType: source.markupType,
      markupValue: source.markupValue,
      sections: {
        create: source.sections.map((s) => ({
          type: s.type,
          title: s.title,
          content: s.content,
          order: s.order,
          isEditable: s.isEditable,
          photoIds: remapPhotoIds(s.photoIds),
        })),
      },
      pricingLineItems: {
        create: source.pricingLineItems.map((li) => ({
          description: li.description,
          quantity: li.quantity,
          unit: li.unit,
          unitPrice: li.unitPrice,
          vat: li.vat,
          discount: li.discount,
          isOptional: li.isOptional,
          order: li.order,
        })),
      },
    },
  })

  return NextResponse.json({ id: copy.id, surveyId: survey.id }, { status: 201 })
}
