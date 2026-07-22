import { NextRequest, NextResponse } from "next/server"
import { db } from "@/lib/db"
import { getCurrentUser } from "@/lib/session"

// Deep-copies a survey (details + photos) as a fresh draft with no proposal, so
// a similar job can be reused. Voice notes/transcripts are intentionally skipped.
export async function POST(
  _request: NextRequest,
  { params }: { params: { surveyId: string } }
) {
  const user = await getCurrentUser()
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  const source = await db.siteSurvey.findFirst({
    where: { id: params.surveyId, organizationId: user.organizationId },
    include: { photos: { orderBy: { order: "asc" } } },
  })
  if (!source) return NextResponse.json({ error: "Not found" }, { status: 404 })

  const copy = await db.siteSurvey.create({
    data: {
      organizationId: user.organizationId,
      createdById: user.id,
      clientName: source.clientName,
      clientCompany: source.clientCompany,
      clientEmail: source.clientEmail,
      clientPhone: source.clientPhone,
      clientAddress: source.clientAddress,
      latitude: source.latitude,
      longitude: source.longitude,
      title: `Copy of ${source.title}`,
      serviceType: source.serviceType,
      isResidential: source.isResidential,
      clientPriorities: source.clientPriorities,
      accessNotes: source.accessNotes,
      measurements: source.measurements,
      exclusions: source.exclusions,
      writtenDescription: source.writtenDescription,
      photos: {
        create: source.photos.map((ph) => ({
          fileUrl: ph.fileUrl,
          fileName: ph.fileName,
          fileSize: ph.fileSize,
          caption: ph.caption,
          order: ph.order,
          isCoverImage: ph.isCoverImage,
          includeInProposal: ph.includeInProposal,
          internalOnly: ph.internalOnly,
        })),
      },
    },
  })

  return NextResponse.json({ id: copy.id }, { status: 201 })
}
