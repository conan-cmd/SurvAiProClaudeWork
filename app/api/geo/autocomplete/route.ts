import { NextRequest, NextResponse } from "next/server"
import { getCurrentUser } from "@/lib/session"

// Proxies Google Places Autocomplete so the API key stays server-side.
// Returns [] when no key is configured - the address field degrades to plain typing.
export async function GET(request: NextRequest) {
  const user = await getCurrentUser()
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  const q = request.nextUrl.searchParams.get("q")?.trim()
  const key = process.env.GOOGLE_MAPS_API_KEY
  if (!q || q.length < 4 || !key) return NextResponse.json([])

  try {
    const res = await fetch(
      `https://maps.googleapis.com/maps/api/place/autocomplete/json?input=${encodeURIComponent(q)}&components=country:gb&types=address&key=${key}`,
      { signal: AbortSignal.timeout(6000) }
    )
    const data = await res.json()
    const suggestions = (data.predictions || [])
      .slice(0, 5)
      .map((p: { description: string }) => p.description)
    return NextResponse.json(suggestions)
  } catch {
    return NextResponse.json([])
  }
}
