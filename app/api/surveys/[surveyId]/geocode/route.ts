import { NextRequest, NextResponse } from "next/server"
import { z } from "zod"
import { db } from "@/lib/db"
import { getCurrentUser } from "@/lib/session"
import { geocodeAddress, refreshSiteImagery, what3wordsFor } from "@/lib/geo"

// Re-geocodes the survey from a corrected address and refreshes the Street View
// + aerial hero shots for the new spot. Used when the auto-located pin landed on
// the wrong property (or never resolved at all).
const schema = z.object({ address: z.string().min(1, "Enter an address") })

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
  const address = parsed.data.address.trim()

  const coords = await geocodeAddress(address)
  if (!coords) {
    // Save the corrected text anyway so it isn't lost, but tell the user we
    // couldn't place it — they can drop the pin manually once there's a map.
    await db.siteSurvey.update({ where: { id: survey.id }, data: { clientAddress: address } })
    return NextResponse.json(
      { error: "Couldn't find that address on the map. Add the town and postcode, or drop the pin manually." },
      { status: 422 }
    )
  }

  const words = await what3wordsFor(coords.lat, coords.lng)
  await db.siteSurvey.update({
    where: { id: survey.id },
    data: {
      clientAddress: address,
      latitude: coords.lat,
      longitude: coords.lng,
      what3words: words,
      // New location — clear the old Street View heading / aerial zoom fine-tuning.
      streetViewHeading: null,
      aerialZoom: null,
    },
  })

  let imageryOk = true
  try {
    await refreshSiteImagery({
      surveyId: survey.id,
      organizationId: user.organizationId,
      lat: coords.lat,
      lng: coords.lng,
    })
  } catch (err) {
    console.error("Imagery refresh failed:", err)
    imageryOk = false
  }

  const photos = await db.surveyPhoto.findMany({
    where: { surveyId: survey.id },
    orderBy: { order: "asc" },
  })
  return NextResponse.json({
    clientAddress: address,
    latitude: coords.lat,
    longitude: coords.lng,
    what3words: words,
    photos,
    imageryOk,
  })
}
