import { NextRequest, NextResponse } from "next/server"
import { getCurrentUser } from "@/lib/session"

// Proxies Google Places Autocomplete so the API key stays server-side.
// Returns [] when no key is configured - the address field degrades to plain typing.
export async function GET(request: NextRequest) {
  const user = await getCurrentUser()
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  const key = process.env.GOOGLE_MAPS_API_KEY
  const sp = request.nextUrl.searchParams
  const lat = sp.get("lat")
  const lng = sp.get("lng")

  // Reverse geocode: device location -> full address ("Use my location")
  if (sp.get("mode") === "reverse" && lat && lng && key) {
    try {
      const res = await fetch(
        `https://maps.googleapis.com/maps/api/geocode/json?latlng=${lat},${lng}&result_type=street_address|premise&key=${key}`,
        { signal: AbortSignal.timeout(6000) }
      )
      const data = await res.json()
      const address = data.results?.[0]?.formatted_address
      return NextResponse.json(address ? [address] : [])
    } catch {
      return NextResponse.json([])
    }
  }

  const q = sp.get("q")?.trim()
  if (!q || q.length < 2 || !key) return NextResponse.json([])

  // Bias suggestions towards the device's location when provided -
  // the surveyor is usually standing at or near the property
  const bias = lat && lng ? `&location=${lat},${lng}&radius=3000` : ""

  try {
    const res = await fetch(
      `https://maps.googleapis.com/maps/api/place/autocomplete/json?input=${encodeURIComponent(q)}&components=country:gb&types=address${bias}&key=${key}`,
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
