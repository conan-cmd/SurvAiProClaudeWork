import { NextRequest, NextResponse } from "next/server"
import { z } from "zod"
import { db } from "@/lib/db"
import { getCurrentUser } from "@/lib/session"
import { polygonAreaSqm, polylineLengthMeters, attachMeasurementImagery } from "@/lib/geo"

const latlng = z.object({ lat: z.number(), lng: z.number() })
const schema = z.object({
  measurements: z.array(z.object({
    id: z.string(),
    type: z.enum(["area", "line", "note"]),
    points: z.array(latlng),
    label: z.string().max(120).optional(),
  })).max(50),
  zoom: z.number().int().min(15).max(21).optional(),
  showOnProposal: z.boolean().optional(),
  renderedImage: z.string().startsWith("data:image/").max(8_000_000).optional(),
})

// Saves the site markup (areas, lines, annotations), computes the totals
// server-side, and bakes a highlighted aerial onto the survey.
export async function POST(
  request: NextRequest,
  { params }: { params: { surveyId: string } }
) {
  const user = await getCurrentUser()
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  const survey = await db.siteSurvey.findFirst({
    where: { id: params.surveyId, organizationId: user.organizationId },
    select: { id: true, latitude: true, longitude: true },
  })
  if (!survey) return NextResponse.json({ error: "Not found" }, { status: 404 })
  if (survey.latitude == null || survey.longitude == null) {
    return NextResponse.json({ error: "This survey has no map location yet." }, { status: 400 })
  }

  const parsed = schema.safeParse(await request.json())
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.errors[0].message }, { status: 400 })
  }
  const { measurements, zoom } = parsed.data
  const showOnProposal = parsed.data.showOnProposal ?? true

  const areaSqm = measurements
    .filter((m) => m.type === "area")
    .reduce((s, m) => s + polygonAreaSqm(m.points), 0)
  const linearMeters = measurements
    .filter((m) => m.type === "line")
    .reduce((s, m) => s + polylineLengthMeters(m.points), 0)

  await db.siteSurvey.update({
    where: { id: survey.id },
    data: {
      mapMeasurements: JSON.stringify(measurements),
      areaSqm: areaSqm || null,
      linearMeters: linearMeters || null,
      showMeasurementsOnProposal: showOnProposal,
    },
  })

  // Best-effort bake (never fail the save if imagery is down).
  try {
    await attachMeasurementImagery({
      surveyId: survey.id,
      organizationId: user.organizationId,
      lat: survey.latitude,
      lng: survey.longitude,
      zoom,
      measurements,
      include: showOnProposal,
      renderedImage: parsed.data.renderedImage,
    })
  } catch (err) {
    console.error("Measurement imagery failed:", err)
  }

  const photos = await db.surveyPhoto.findMany({
    where: { surveyId: survey.id },
    orderBy: { order: "asc" },
  })
  return NextResponse.json({ areaSqm, linearMeters, photos })
}

export async function DELETE(
  _request: NextRequest,
  { params }: { params: { surveyId: string } }
) {
  const user = await getCurrentUser()
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  const survey = await db.siteSurvey.findFirst({
    where: { id: params.surveyId, organizationId: user.organizationId },
    select: { id: true },
  })
  if (!survey) return NextResponse.json({ error: "Not found" }, { status: 404 })

  await db.siteSurvey.update({
    where: { id: survey.id },
    data: { mapMeasurements: null, areaPolygon: null, areaSqm: null, linearMeters: null },
  })
  const { deleteFile } = await import("@/lib/storage")
  const prior = await db.surveyPhoto.findMany({ where: { surveyId: survey.id, fileName: "measured-area.jpg" } })
  for (const p of prior) {
    await deleteFile(p.fileUrl).catch(() => {})
    await db.surveyPhoto.delete({ where: { id: p.id } }).catch(() => {})
  }

  const photos = await db.surveyPhoto.findMany({ where: { surveyId: survey.id }, orderBy: { order: "asc" } })
  return NextResponse.json({ success: true, photos })
}
