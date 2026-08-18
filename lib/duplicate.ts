import "server-only"
import { db } from "@/lib/db"

// Deep-copies a survey (details + photos) as a fresh draft. Voice notes and
// transcripts are intentionally skipped. Returns the new survey's id plus an
// old→new photo id map so callers can remap photo references (e.g. a
// proposal section's explicit photoIds selection).
export async function duplicateSurvey(
  surveyId: string,
  user: { id: string; organizationId: string }
) {
  const source = await db.siteSurvey.findFirst({
    where: { id: surveyId, organizationId: user.organizationId },
    include: { photos: { orderBy: { order: "asc" } } },
  })
  if (!source) return null

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
      what3words: source.what3words,
      streetViewHeading: source.streetViewHeading,
      aerialZoom: source.aerialZoom,
      areaPolygon: source.areaPolygon,
      areaSqm: source.areaSqm,
      mapMeasurements: source.mapMeasurements,
      linearMeters: source.linearMeters,
      showMeasurementsOnProposal: source.showMeasurementsOnProposal,
      title: `Copy of ${source.title}`,
      serviceType: source.serviceType,
      isResidential: source.isResidential,
      clientPriorities: source.clientPriorities,
      accessNotes: source.accessNotes,
      measurements: source.measurements,
      exclusions: source.exclusions,
      chemicalsRequired: source.chemicalsRequired,
      waterSupply: source.waterSupply,
      writtenDescription: source.writtenDescription,
      folderId: source.folderId,
    },
  })

  // Photos are created one by one (not nested) so we can map old id → new id.
  const photoIdMap = new Map<string, string>()
  for (const ph of source.photos) {
    const created = await db.surveyPhoto.create({
      data: {
        surveyId: copy.id,
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
    photoIdMap.set(ph.id, created.id)
  }

  return { id: copy.id, photoIdMap }
}
