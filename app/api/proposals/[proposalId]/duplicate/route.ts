import { NextRequest, NextResponse } from "next/server"
import { db } from "@/lib/db"
import { getCurrentUser } from "@/lib/session"

// Deep-copies a proposal AND its underlying survey (details + photos) as a
// fresh draft — sections and pricing included, signatures/links/nudges not.
// Section photo references are remapped onto the copied photos.
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
      survey: { include: { photos: { orderBy: { order: "asc" } } } },
    },
  })
  if (!source) return NextResponse.json({ error: "Not found" }, { status: 404 })
  const s = source.survey

  const surveyCopy = await db.siteSurvey.create({
    data: {
      organizationId: user.organizationId,
      createdById: user.id,
      clientName: s.clientName,
      clientCompany: s.clientCompany,
      clientEmail: s.clientEmail,
      clientPhone: s.clientPhone,
      clientAddress: s.clientAddress,
      latitude: s.latitude,
      longitude: s.longitude,
      what3words: s.what3words,
      title: `Copy of ${s.title}`,
      serviceType: s.serviceType,
      isResidential: s.isResidential,
      clientPriorities: s.clientPriorities,
      accessNotes: s.accessNotes,
      measurements: s.measurements,
      exclusions: s.exclusions,
      writtenDescription: s.writtenDescription,
    },
  })

  // Photos one-by-one so old→new ids can be remapped in section photoIds.
  const photoIdMap = new Map<string, string>()
  for (const ph of s.photos) {
    const copy = await db.surveyPhoto.create({
      data: {
        surveyId: surveyCopy.id,
        fileUrl: ph.fileUrl,
        fileName: ph.fileName,
        fileSize: ph.fileSize,
        caption: ph.caption,
        order: ph.order,
        isCoverImage: ph.isCoverImage,
        includeInProposal: ph.includeInProposal,
        internalOnly: ph.internalOnly,
      },
    })
    photoIdMap.set(ph.id, copy.id)
  }

  const remapPhotoIds = (json: string | null): string | null => {
    if (!json) return null
    try {
      const ids = JSON.parse(json)
      if (!Array.isArray(ids)) return null
      const mapped = ids.map((id) => photoIdMap.get(id)).filter(Boolean)
      return mapped.length ? JSON.stringify(mapped) : null
    } catch {
      return null
    }
  }

  const proposalCopy = await db.proposal.create({
    data: {
      organizationId: user.organizationId,
      surveyId: surveyCopy.id,
      createdById: user.id,
      clientName: source.clientName,
      clientEmail: source.clientEmail,
      templateName: source.templateName,
      status: "DRAFT",
      identityMode: source.identityMode,
      identityUserId: source.identityUserId,
      sections: {
        create: source.sections.map((sec) => ({
          type: sec.type,
          title: sec.title,
          content: sec.content,
          order: sec.order,
          isEditable: sec.isEditable,
          photoIds: remapPhotoIds(sec.photoIds),
        })),
      },
      pricingLineItems: {
        create: source.pricingLineItems.map((i) => ({
          description: i.description,
          quantity: i.quantity,
          unit: i.unit,
          unitPrice: i.unitPrice,
          vat: i.vat,
          discount: i.discount,
          isOptional: i.isOptional,
          order: i.order,
        })),
      },
    },
  })

  return NextResponse.json({ id: proposalCopy.id }, { status: 201 })
}
