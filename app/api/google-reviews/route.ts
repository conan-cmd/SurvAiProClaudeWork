import { NextRequest, NextResponse } from "next/server"
import { z } from "zod"
import { db } from "@/lib/db"
import { getCurrentUser } from "@/lib/session"
import { searchBusiness, fetchPlaceReviews } from "@/lib/google-places"

// GET ?q= — find the business on Google (to connect it).
// GET with no q — reviews for the already-connected place.
export async function GET(request: NextRequest) {
  const user = await getCurrentUser()
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  const q = request.nextUrl.searchParams.get("q")?.trim()
  if (q) {
    const results = await searchBusiness(q)
    return NextResponse.json({ results })
  }

  const org = await db.organization.findUnique({
    where: { id: user.organizationId },
    select: { googlePlaceId: true },
  })
  if (!org?.googlePlaceId) return NextResponse.json({ connected: false, reviews: [] })
  const { name, reviews } = await fetchPlaceReviews(org.googlePlaceId)
  return NextResponse.json({ connected: true, name, reviews })
}

// POST { placeId } — connect the business and return its reviews.
const connectSchema = z.object({ placeId: z.string().min(5).max(300) })

export async function POST(request: NextRequest) {
  const user = await getCurrentUser()
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  const parsed = connectSchema.safeParse(await request.json())
  if (!parsed.success) return NextResponse.json({ error: "Invalid request" }, { status: 400 })

  const { name, reviews } = await fetchPlaceReviews(parsed.data.placeId)
  if (!name) return NextResponse.json({ error: "Couldn't load that business from Google" }, { status: 502 })

  await db.organization.update({
    where: { id: user.organizationId },
    data: { googlePlaceId: parsed.data.placeId },
  })
  return NextResponse.json({ connected: true, name, reviews })
}
