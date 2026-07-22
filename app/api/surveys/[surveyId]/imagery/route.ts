import { NextRequest, NextResponse } from "next/server"
import { z } from "zod"
import { db } from "@/lib/db"
import { getCurrentUser } from "@/lib/session"
import { refreshSiteImagery, what3wordsFor } from "@/lib/geo"

// Corrects the site location and re-fetches the Street View + aerial hero shots
// for the new spot (replacing only the auto-generated ones).
const schema = z.object({
  latitude: z.number().min(-90).max(90),
  longitude: z.number().min(-180).max(180),
  heading: z.number().min(0).max(360).optional(),
})

export async function POST(
  request: NextRequest,
  { params }: { params: { surveyId: string } }
) {
  const user = await getCurrentUser()
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  const survey = await db.siteSurvey.findFirst({
    where: { id: params.surveyId, organizationId: user.organizationId },
  })
  if (!survey) return NextResponse.json({ error: "Not found" }, { status: 404 })

  const parsed = schema.safeParse(await request.json())
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.errors[0].message }, { status: 400 })
  }

  const words = await what3wordsFor(parsed.data.latitude, parsed.data.longitude)
  await db.siteSurvey.update({
    where: { id: survey.id },
    data: {
      latitude: parsed.data.latitude,
      longitude: parsed.data.longitude,
      what3words: words,
    },
  })

  try {
    await refreshSiteImagery({
      surveyId: survey.id,
      organizationId: user.organizationId,
      lat: parsed.data.latitude,
      lng: parsed.data.longitude,
      heading: parsed.data.heading,
    })
  } catch (err) {
    console.error("Imagery refresh failed:", err)
    return NextResponse.json(
      { error: "Location saved, but the imagery couldn't be refreshed. Try again." },
      { status: 502 }
    )
  }

  const photos = await db.surveyPhoto.findMany({
    where: { surveyId: survey.id },
    orderBy: { order: "asc" },
  })
  return NextResponse.json({
    latitude: parsed.data.latitude,
    longitude: parsed.data.longitude,
    photos,
  })
}
