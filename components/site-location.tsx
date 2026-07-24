"use client"

import { useState } from "react"
import { toast } from "sonner"
import { Loader2, RefreshCw } from "lucide-react"
import type { Photo } from "@/components/photo-manager"

// The aerial preview is a Google Static Map at this zoom and logical size, so we
// can convert a click position back to lat/lng with standard Web-Mercator math.
const DEFAULT_ZOOM = 20
const LOGICAL_W = 640
const LOGICAL_H = 480
const TILE = 256

function project(lat: number, lng: number, zoom: number) {
  const worldSize = TILE * 2 ** zoom
  const x = ((lng + 180) / 360) * worldSize
  const sinLat = Math.sin((lat * Math.PI) / 180)
  const y = (0.5 - Math.log((1 + sinLat) / (1 - sinLat)) / (4 * Math.PI)) * worldSize
  return { x, y }
}
function unproject(x: number, y: number, zoom: number) {
  const worldSize = TILE * 2 ** zoom
  const lng = (x / worldSize) * 360 - 180
  const n = Math.PI - (2 * Math.PI * y) / worldSize
  const lat = (180 / Math.PI) * Math.atan(0.5 * (Math.exp(n) - Math.exp(-n)))
  return { lat, lng }
}

export function SiteLocation({
  surveyId,
  latitude,
  longitude,
  savedHeading,
  savedZoom,
  onPhotosChange,
}: {
  surveyId: string
  latitude: number | null
  longitude: number | null
  savedHeading?: number | null
  savedZoom?: number | null
  onPhotosChange: (photos: Photo[]) => void
}) {
  const [lat, setLat] = useState<number | null>(latitude)
  const [lng, setLng] = useState<number | null>(longitude)
  // Restore the last-saved fine-tuning so the position isn't lost on return.
  const [heading, setHeading] = useState(savedHeading ?? 0)
  const [zoom, setZoom] = useState(savedZoom ?? DEFAULT_ZOOM)
  const [saving, setSaving] = useState(false)

  if (lat == null || lng == null) {
    return (
      <p className="text-sm text-gray-400">
        No map location yet. Add a site address to the survey and the Street View and aerial shots
        are fetched automatically — then you can fine-tune them here.
      </p>
    )
  }

  const baseHeading = savedHeading ?? 0
  const baseZoom = savedZoom ?? DEFAULT_ZOOM
  const moved = lat !== latitude || lng !== longitude || heading !== baseHeading || zoom !== baseZoom
  const aerialSrc = `/api/geo/static?type=aerial&lat=${lat}&lng=${lng}&zoom=${zoom}`
  const streetSrc = `/api/geo/static?type=streetview&lat=${lat}&lng=${lng}&heading=${heading}`

  // Click on the aerial recentres the pin on that spot (accounts for zoom).
  const onAerialClick = (e: React.MouseEvent<HTMLImageElement>) => {
    const rect = e.currentTarget.getBoundingClientRect()
    const offsetX = ((e.clientX - rect.left) / rect.width) * LOGICAL_W - LOGICAL_W / 2
    const offsetY = ((e.clientY - rect.top) / rect.height) * LOGICAL_H - LOGICAL_H / 2
    const center = project(lat, lng, zoom)
    const next = unproject(center.x + offsetX, center.y + offsetY, zoom)
    setLat(next.lat)
    setLng(next.lng)
  }

  const save = async () => {
    if (lat == null || lng == null) return
    setSaving(true)
    try {
      const res = await fetch(`/api/surveys/${surveyId}/imagery`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ latitude: lat, longitude: lng, heading, zoom }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || "Update failed")
      onPhotosChange(data.photos)
      toast.success("Site location updated and imagery refreshed")
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Update failed")
    } finally {
      setSaving(false)
    }
  }

  const reset = () => {
    setLat(latitude)
    setLng(longitude)
    setHeading(baseHeading)
    setZoom(baseZoom)
  }

  return (
    <div className="space-y-4">
      <p className="text-sm text-gray-500">
        Click the aerial photo to move the pin onto the exact property, and use the slider to face
        the Street View the right way. Then update the imagery on the proposal.
      </p>

      <div className="grid sm:grid-cols-2 gap-4">
        <div>
          <div className="text-xs font-medium text-gray-500 mb-1">Aerial — click to reposition, +/− to zoom</div>
          <div className="relative rounded-lg overflow-hidden border">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={aerialSrc} alt="Aerial view of the site" onClick={onAerialClick}
              className="w-full aspect-[4/3] object-cover cursor-crosshair select-none" />
            <div className="absolute top-2 right-2 flex flex-col gap-1">
              <button type="button" onClick={() => setZoom((z) => Math.min(21, z + 1))}
                aria-label="Zoom in"
                className="w-8 h-8 flex items-center justify-center bg-white/90 rounded shadow text-lg font-bold text-gray-700 hover:bg-white">+</button>
              <button type="button" onClick={() => setZoom((z) => Math.max(15, z - 1))}
                aria-label="Zoom out"
                className="w-8 h-8 flex items-center justify-center bg-white/90 rounded shadow text-lg font-bold text-gray-700 hover:bg-white">−</button>
            </div>
          </div>
        </div>
        <div>
          <div className="text-xs font-medium text-gray-500 mb-1">Street View — rotate to face the property</div>
          <div className="rounded-lg overflow-hidden border">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={streetSrc} alt="Street view of the property" className="w-full aspect-[4/3] object-cover" />
          </div>
          <input type="range" min={0} max={360} value={heading}
            onChange={(e) => setHeading(Number(e.target.value))} className="w-full mt-2" />
          <div className="text-xs text-gray-400 text-center">Facing {heading}°</div>
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-3">
        <button onClick={save} disabled={saving || !moved}
          className="inline-flex items-center gap-2 px-4 py-2 bg-brand-blue text-white rounded-lg text-sm font-semibold hover:bg-blue-700 disabled:opacity-50">
          {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <RefreshCw className="w-4 h-4" />}
          {saving ? "Updating…" : "Update site imagery"}
        </button>
        {moved && !saving && (
          <button onClick={reset} className="text-sm text-gray-500 hover:underline">Reset</button>
        )}
        <span className="text-xs text-gray-400">{lat.toFixed(6)}, {lng.toFixed(6)}</span>
      </div>
    </div>
  )
}
