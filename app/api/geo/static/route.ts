import { NextRequest, NextResponse } from "next/server"
import { getCurrentUser } from "@/lib/session"

// Proxies a Google Static Map (aerial) or Street View image for arbitrary
// coordinates, so the survey "site location" panel can preview imagery while the
// user repositions the pin - without exposing the Maps key to the browser.
export async function GET(request: NextRequest) {
  const user = await getCurrentUser()
  if (!user) return new NextResponse("Unauthorized", { status: 401 })

  const key = process.env.GOOGLE_MAPS_API_KEY
  if (!key) return new NextResponse("Maps not configured", { status: 503 })

  const sp = request.nextUrl.searchParams
  const lat = parseFloat(sp.get("lat") || "")
  const lng = parseFloat(sp.get("lng") || "")
  if (Number.isNaN(lat) || Number.isNaN(lng)) {
    return new NextResponse("Invalid coordinates", { status: 400 })
  }
  const type = sp.get("type") === "streetview" ? "streetview" : "aerial"
  const headingRaw = parseFloat(sp.get("heading") || "")
  const heading = Number.isNaN(headingRaw) ? "" : `&heading=${headingRaw}`

  const url =
    type === "streetview"
      ? `https://maps.googleapis.com/maps/api/streetview?size=640x480&location=${lat},${lng}&fov=75${heading}&key=${key}`
      : `https://maps.googleapis.com/maps/api/staticmap?center=${lat},${lng}&zoom=20&scale=2&size=640x480&maptype=hybrid&markers=color:red%7C${lat},${lng}&key=${key}`

  try {
    const res = await fetch(url, { signal: AbortSignal.timeout(10000) })
    if (!res.ok) return new NextResponse("Imagery unavailable", { status: 502 })
    const buf = new Uint8Array(await res.arrayBuffer())
    return new NextResponse(buf, {
      headers: {
        "Content-Type": res.headers.get("content-type") || "image/jpeg",
        "Cache-Control": "private, max-age=60",
      },
    })
  } catch {
    return new NextResponse("Imagery unavailable", { status: 502 })
  }
}
