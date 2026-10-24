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
    if (data.status === "OK" || data.status === "ZERO_RESULTS") {
      const suggestions = (data.predictions || [])
        .slice(0, 5)
        .map((p: { description: string }) => p.description)
      return NextResponse.json(suggestions)
    }
    // Legacy endpoint refused (key restrictions, billing, or Google's phased
    // retirement of legacy Places) — log the real reason and fall back to the
    // new Places API, which uses the same key when enabled on the project.
    console.error("Places autocomplete (legacy):", data.status, data.error_message)
    const res2 = await fetch("https://places.googleapis.com/v1/places:autocomplete", {
      method: "POST",
      headers: { "Content-Type": "application/json", "X-Goog-Api-Key": key },
      body: JSON.stringify({
        input: q,
        includedRegionCodes: ["GB"],
        ...(lat && lng
          ? { locationBias: { circle: { center: { latitude: Number(lat), longitude: Number(lng) }, radius: 3000 } } }
          : {}),
      }),
      signal: AbortSignal.timeout(6000),
    })
    const d2 = (await res2.json().catch(() => ({}))) as {
      error?: { message?: string }
      suggestions?: { placePrediction?: { text?: { text?: string } } }[]
    }
    if (!res2.ok) {
      console.error("Places autocomplete (new):", res2.status, d2.error?.message)
      return NextResponse.json([])
    }
    const suggestions = (d2.suggestions || [])
      .map((s) => s.placePrediction?.text?.text)
      .filter((t): t is string => Boolean(t))
      .slice(0, 5)
    return NextResponse.json(suggestions)
  } catch (err) {
    console.error("Places autocomplete failed:", err)
    return NextResponse.json([])
  }
}
