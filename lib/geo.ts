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
