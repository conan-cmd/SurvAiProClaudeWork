import "server-only"
import { db } from "./db"
import { uploadFile, deleteFile } from "./storage"

// The fixed file names of the auto-generated hero shots, so they can be found
// and replaced when the user corrects the site location.
export const AUTO_IMAGERY_NAMES = ["street-view.jpg", "aerial-view.jpg"]

const KEY = () => process.env.GOOGLE_MAPS_API_KEY

export function geoEnabled(): boolean {
  return Boolean(KEY())
}

export async function geocodeAddress(
  address: string
): Promise<{ lat: number; lng: number } | null> {
  if (!geoEnabled()) return null
  try {
    const res = await fetch(
      `https://maps.googleapis.com/maps/api/geocode/json?address=${encodeURIComponent(address)}&region=gb&key=${KEY()}`,
      { signal: AbortSignal.timeout(8000) }
    )
    const data = await res.json()
    const loc = data.results?.[0]?.geometry?.location
    return loc ? { lat: loc.lat, lng: loc.lng } : null
  } catch {
    return null
  }
}

// Converts coordinates to a what3words address (e.g. "index.home.raft").
// Returns null if the key is missing or the plan/quota rejects the call.
export async function what3wordsFor(lat: number, lng: number): Promise<string | null> {
  const key = process.env.WHAT3WORDS_API_KEY
  if (!key) return null
  try {
    const res = await fetch(
      `https://api.what3words.com/v3/convert-to-3wa?coordinates=${lat},${lng}&key=${key}`,
      { signal: AbortSignal.timeout(8000) }
    )
    const data = await res.json()
    return typeof data.words === "string" ? data.words : null
  } catch {
    return null
  }
}

async function fetchImage(url: string): Promise<Buffer | null> {
  try {
    const res = await fetch(url, { signal: AbortSignal.timeout(10000) })
    if (!res.ok) return null
    const buf = Buffer.from(await res.arrayBuffer())
    return buf.length > 5000 ? buf : null // tiny responses are "no imagery" placeholders
  } catch {
    return null
  }
}

/**
 * Fetches a Street View facade shot and a satellite aerial for the site and
 * attaches them as survey photos (street view suggested as cover).
 * Silently does nothing if the key is missing or imagery is unavailable.
 */
export async function attachSiteImagery(params: {
  surveyId: string
  organizationId: string
  address: string
  lat: number
  lng: number
  heading?: number
}): Promise<void> {
  const { surveyId, organizationId, lat, lng, heading } = params
  const key = KEY()
  if (!key) return

  const headingParam =
    typeof heading === "number" && !Number.isNaN(heading) ? `&heading=${heading}` : ""
  const shots: { name: string; caption: string; url: string; cover: boolean }[] = [
    {
      name: "street-view.jpg",
      caption: "The property - street view",
      cover: true,
      url: `https://maps.googleapis.com/maps/api/streetview?size=640x480&location=${lat},${lng}&fov=75${headingParam}&key=${key}`,
    },
    {
      name: "aerial-view.jpg",
      caption: "Aerial view of the site",
      cover: false,
      url: `https://maps.googleapis.com/maps/api/staticmap?center=${lat},${lng}&zoom=20&scale=2&size=640x480&maptype=hybrid&markers=color:red%7C${lat},${lng}&key=${key}`,
    },
  ]

  const count = await db.surveyPhoto.count({ where: { surveyId } })
  let order = count

  for (const shot of shots) {
    const buf = await fetchImage(shot.url)
    if (!buf) continue
    const file = new File([new Uint8Array(buf)], shot.name, { type: "image/jpeg" })
    const storedUrl = await uploadFile(
      file,
      `organizations/${organizationId}/surveys/${surveyId}/photos/${shot.name}`
    )
    await db.surveyPhoto.create({
      data: {
        surveyId,
        fileUrl: storedUrl,
        fileName: shot.name,
        fileSize: buf.length,
        caption: shot.caption,
        order: order++,
        isCoverImage: shot.cover && count === 0,
      },
    })
  }
}

export type LatLng = { lat: number; lng: number }

// Nearest hospital to the site (for the RAMS emergency section), via Google
// Places Nearby Search ranked by distance. Returns null if unavailable.
export async function nearestHospital(lat: number, lng: number): Promise<{ name: string; address: string } | null> {
  const key = KEY()
  if (!key) return null
  const url =
    `https://maps.googleapis.com/maps/api/place/nearbysearch/json?location=${lat},${lng}` +
    `&rankby=distance&type=hospital&keyword=hospital&key=${key}`
  try {
    const res = await fetch(url, { signal: AbortSignal.timeout(8000) })
    if (!res.ok) return null
    const data = await res.json()
    const r = data.results?.[0]
    if (!r) return null
    return { name: r.name || "", address: r.vicinity || "" }
  } catch {
    return null
  }
}

// Total length in metres of a polyline (haversine between consecutive points).
export function polylineLengthMeters(points: LatLng[]): number {
  if (!points || points.length < 2) return 0
  const R = 6378137
  const rad = (d: number) => (d * Math.PI) / 180
  let total = 0
  for (let i = 1; i < points.length; i++) {
    const a = points[i - 1]
    const b = points[i]
    const dLat = rad(b.lat - a.lat)
    const dLng = rad(b.lng - a.lng)
    const s =
      Math.sin(dLat / 2) ** 2 +
      Math.cos(rad(a.lat)) * Math.cos(rad(b.lat)) * Math.sin(dLng / 2) ** 2
    total += 2 * R * Math.asin(Math.min(1, Math.sqrt(s)))
  }
  return total
}

// Area of a lat/lng polygon in m² using the spherical-excess formula (same maths
// Google Maps / Leaflet use). Good to a fraction of a percent at property scale.
export function polygonAreaSqm(points: LatLng[]): number {
  if (!points || points.length < 3) return 0
  const R = 6378137
  const rad = (d: number) => (d * Math.PI) / 180
  let total = 0
  for (let i = 0; i < points.length; i++) {
    const p1 = points[i]
    const p2 = points[(i + 1) % points.length]
    total += rad(p2.lng - p1.lng) * (2 + Math.sin(rad(p1.lat)) + Math.sin(rad(p2.lat)))
  }
  return Math.abs((total * R * R) / 2)
}

export type Measurement = { id: string; type: "area" | "line" | "note"; points: LatLng[]; label?: string }

// Builds a hybrid Static Map with all measurements drawn on it (areas filled,
// lines as polylines, notes as lettered markers) and stores it as a survey photo
// ("measured-area.jpg") so it flows onto the proposal. Replaces any prior one.
export async function attachMeasurementImagery(params: {
  surveyId: string
  organizationId: string
  lat: number
  lng: number
  zoom?: number
  measurements: Measurement[]
  include: boolean
  // A client-rendered PNG/JPEG data URL with annotation text drawn on the image.
  // When present it's stored as-is (no Google Static Map fetch).
  renderedImage?: string
}): Promise<void> {
  const key = KEY()
  const { surveyId, organizationId, lat, lng, zoom, measurements, include, renderedImage } = params

  const prior = await db.surveyPhoto.findMany({ where: { surveyId, fileName: "measured-area.jpg" } })
  for (const p of prior) {
    await deleteFile(p.fileUrl).catch(() => {})
    await db.surveyPhoto.delete({ where: { id: p.id } }).catch(() => {})
  }

  const areas = measurements.filter((m) => m.type === "area" && m.points.length >= 3)
  const lines = measurements.filter((m) => m.type === "line" && m.points.length >= 2)
  const notes = measurements.filter((m) => m.type === "note" && m.points.length >= 1)
  if (!areas.length && !lines.length && !notes.length) return

  // Prefer the client-rendered image (has real annotation text); else fall back to
  // a Google Static Map with lettered markers.
  let buf: Uint8Array | null = null
  if (renderedImage && renderedImage.startsWith("data:image/")) {
    try { buf = new Uint8Array(Buffer.from(renderedImage.split(",")[1] || "", "base64")) } catch { buf = null }
  }
  if (!buf) {
    if (!key) return
    const z = Math.min(21, Math.max(15, zoom || 20))
    const parts = [`center=${lat},${lng}`, `zoom=${z}`, `scale=2`, `size=640x480`, `maptype=hybrid`]
    const fmt = (p: LatLng) => `${p.lat.toFixed(6)},${p.lng.toFixed(6)}`
    for (const a of areas) {
      const pts = [...a.points, a.points[0]].map(fmt).join("|")
      parts.push(`path=${encodeURIComponent(`fillcolor:0xFFEB0033|color:0xFFEB00FF|weight:3|${pts}`)}`)
    }
    for (const l of lines) {
      parts.push(`path=${encodeURIComponent(`color:0x00B7FFFF|weight:4|${l.points.map(fmt).join("|")}`)}`)
    }
    notes.forEach((n, i) => {
      const letter = String.fromCharCode(65 + (i % 26))
      parts.push(`markers=${encodeURIComponent(`color:red|label:${letter}|${fmt(n.points[0])}`)}`)
    })
    const url = `https://maps.googleapis.com/maps/api/staticmap?${parts.join("&")}&key=${key}`
    buf = await fetchImage(url)
  }
  if (!buf) return

  const totalArea = areas.reduce((s, a) => s + polygonAreaSqm(a.points), 0)
  const totalLen = lines.reduce((s, l) => s + polylineLengthMeters(l.points), 0)
  const bits: string[] = []
  if (totalArea > 0) bits.push(`Area ≈ ${Math.round(totalArea).toLocaleString()} m² (${Math.round(totalArea * 10.7639).toLocaleString()} ft²)`)
  if (totalLen > 0) bits.push(`Length ≈ ${Math.round(totalLen).toLocaleString()} m`)
  notes.forEach((n, i) => { if (n.label) bits.push(`${String.fromCharCode(65 + (i % 26))}: ${n.label}`) })
  const caption = bits.join(" · ") || "Site measurements"

  const file = new File([new Uint8Array(buf)], "measured-area.jpg", { type: "image/jpeg" })
  const storedUrl = await uploadFile(
    file,
    `organizations/${organizationId}/surveys/${surveyId}/photos/measured-area.jpg`
  )
  const count = await db.surveyPhoto.count({ where: { surveyId } })
  await db.surveyPhoto.create({
    data: {
      surveyId,
      fileUrl: storedUrl,
      fileName: "measured-area.jpg",
      fileSize: buf.length,
      caption,
      order: count,
      isCoverImage: false,
      includeInProposal: include,
    },
  })
}

/**
 * Re-fetches the Street View + aerial hero shots for a corrected site location.
 * Removes only the previous AUTO-generated shots (by their fixed file names) so
 * user-uploaded photos are left untouched, then attaches fresh ones.
 */
export async function refreshSiteImagery(params: {
  surveyId: string
  organizationId: string
  lat: number
  lng: number
  heading?: number
}): Promise<void> {
  const prior = await db.surveyPhoto.findMany({
    where: { surveyId: params.surveyId, fileName: { in: AUTO_IMAGERY_NAMES } },
  })
  for (const p of prior) {
    await deleteFile(p.fileUrl).catch(() => {})
    await db.surveyPhoto.delete({ where: { id: p.id } }).catch(() => {})
  }
  await attachSiteImagery({ ...params, address: "" })
}
