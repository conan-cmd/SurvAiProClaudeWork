"use client"

import { useState } from "react"
import { toast } from "sonner"
import { Loader2, Undo2, Trash2, Save, Check, Square, Minus, MapPin } from "lucide-react"
import type { Photo } from "@/components/photo-manager"

const DEFAULT_ZOOM = 20
const LOGICAL_W = 640
const LOGICAL_H = 480
const TILE = 256

type LatLng = { lat: number; lng: number }
type MType = "area" | "line" | "note"
type Measurement = { id: string; type: MType; points: LatLng[]; label?: string }

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
function areaSqm(points: LatLng[]): number {
  if (points.length < 3) return 0
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
function lineMeters(points: LatLng[]): number {
  if (points.length < 2) return 0
  const R = 6378137
  const rad = (d: number) => (d * Math.PI) / 180
  let total = 0
  for (let i = 1; i < points.length; i++) {
    const a = points[i - 1], b = points[i]
    const s = Math.sin(rad(b.lat - a.lat) / 2) ** 2 +
      Math.cos(rad(a.lat)) * Math.cos(rad(b.lat)) * Math.sin(rad(b.lng - a.lng) / 2) ** 2
    total += 2 * R * Math.asin(Math.min(1, Math.sqrt(s)))
  }
  return total
}

export function AreaMeasure({
  surveyId,
  latitude,
  longitude,
  savedZoom,
  savedMeasurements,
  savedShowOnProposal,
  onPhotosChange,
}: {
  surveyId: string
  latitude: number | null
  longitude: number | null
  savedZoom?: number | null
  savedMeasurements?: Measurement[] | null
  savedShowOnProposal?: boolean
  onPhotosChange: (photos: Photo[]) => void
}) {
  const [items, setItems] = useState<Measurement[]>(savedMeasurements ?? [])
  const [draft, setDraft] = useState<LatLng[]>([])
  const [mode, setMode] = useState<MType>("area")
  const [zoom, setZoom] = useState(savedZoom ?? DEFAULT_ZOOM)
  const [showOnProposal, setShowOnProposal] = useState(savedShowOnProposal ?? true)
  const [saving, setSaving] = useState(false)

  if (latitude == null || longitude == null) {
    return (
      <p className="text-sm text-gray-400">
        No map location yet — add a site address so the aerial imagery is available, then you can
        measure the area here.
      </p>
    )
  }

  const aerialSrc = `/api/geo/static?type=aerial&lat=${latitude}&lng=${longitude}&zoom=${zoom}`
  const center = project(latitude, longitude, zoom)
  const toXY = (p: LatLng) => {
    const w = project(p.lat, p.lng, zoom)
    return { x: w.x - center.x + LOGICAL_W / 2, y: w.y - center.y + LOGICAL_H / 2 }
  }

  const onClickOverlay = (e: React.MouseEvent<SVGSVGElement>) => {
    const rect = e.currentTarget.getBoundingClientRect()
    const px = ((e.clientX - rect.left) / rect.width) * LOGICAL_W
    const py = ((e.clientY - rect.top) / rect.height) * LOGICAL_H
    const pt = unproject(center.x + (px - LOGICAL_W / 2), center.y + (py - LOGICAL_H / 2), zoom)
    if (mode === "note") {
      setItems((it) => [...it, { id: crypto.randomUUID(), type: "note", points: [pt], label: "" }])
    } else {
      setDraft((d) => [...d, pt])
    }
  }

  const finishDraft = () => {
    const min = mode === "area" ? 3 : 2
    if (draft.length < min) {
      toast.error(mode === "area" ? "An area needs at least 3 points" : "A line needs at least 2 points")
      return
    }
    setItems((it) => [...it, { id: crypto.randomUUID(), type: mode, points: draft }])
    setDraft([])
  }
  const removeItem = (id: string) => setItems((it) => it.filter((m) => m.id !== id))
  const setLabel = (id: string, label: string) =>
    setItems((it) => it.map((m) => (m.id === id ? { ...m, label } : m)))

  const notes = items.filter((m) => m.type === "note")
  const noteLetter = (id: string) => String.fromCharCode(65 + (notes.findIndex((n) => n.id === id) % 26))
  const totalArea = items.filter((m) => m.type === "area").reduce((s, m) => s + areaSqm(m.points), 0)
  const totalLen = items.filter((m) => m.type === "line").reduce((s, m) => s + lineMeters(m.points), 0)

  const save = async () => {
    let toSave = items
    // Auto-commit a valid in-progress shape so nothing is lost.
    if ((mode === "area" && draft.length >= 3) || (mode === "line" && draft.length >= 2)) {
      toSave = [...items, { id: crypto.randomUUID(), type: mode, points: draft }]
      setItems(toSave)
      setDraft([])
    }
    if (!toSave.length) {
      toast.error("Add a measurement first")
      return
    }
    setSaving(true)
    try {
      const res = await fetch(`/api/surveys/${surveyId}/area`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ measurements: toSave, zoom, showOnProposal }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || "Save failed")
      onPhotosChange(data.photos)
      toast.success("Measurements saved" + (showOnProposal ? " and added to the proposal" : ""))
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Save failed")
    } finally {
      setSaving(false)
    }
  }

  const clearAll = async () => {
    if (!confirm("Remove all measurements from this survey?")) return
    setItems([]); setDraft([])
    try {
      const res = await fetch(`/api/surveys/${surveyId}/area`, { method: "DELETE" })
      const data = await res.json()
      if (res.ok) onPhotosChange(data.photos)
      toast.success("Measurements removed")
    } catch { /* ignore */ }
  }

  const modeBtn = (m: MType, Icon: typeof Square, label: string) => (
    <button type="button" onClick={() => { setMode(m); setDraft([]) }}
      className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm font-medium border ${
        mode === m ? "border-brand-blue bg-blue-50 text-brand-navy" : "border-gray-200 text-gray-600 hover:bg-gray-50"
      }`}>
      <Icon className="w-4 h-4" /> {label}
    </button>
  )
  const fmtVal = (m: Measurement) =>
    m.type === "area" ? `${Math.round(areaSqm(m.points)).toLocaleString()} m²`
    : m.type === "line" ? `${Math.round(lineMeters(m.points)).toLocaleString()} m`
    : ""

  return (
    <div className="space-y-3">
      <p className="text-sm text-gray-500">
        Pick a tool, then tap the aerial to mark the site. <strong>Area</strong> gives square metres,{" "}
        <strong>Line</strong> gives linear metres, and <strong>Pin</strong> drops a labelled annotation.
      </p>

      <div className="flex flex-wrap gap-2">
        {modeBtn("area", Square, "Area")}
        {modeBtn("line", Minus, "Line")}
        {modeBtn("note", MapPin, "Pin")}
        {mode !== "note" && draft.length > 0 && (
          <button type="button" onClick={finishDraft}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm font-semibold bg-emerald-600 text-white hover:bg-emerald-700">
            <Check className="w-4 h-4" /> Finish {mode}
          </button>
        )}
        {mode !== "note" && draft.length > 0 && (
          <button type="button" onClick={() => setDraft((d) => d.slice(0, -1))}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm font-medium border hover:bg-gray-50">
            <Undo2 className="w-4 h-4" /> Undo point
          </button>
        )}
      </div>

      <div className="relative rounded-lg overflow-hidden border select-none max-w-xl">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={aerialSrc} alt="Aerial view" className="w-full aspect-[4/3] object-cover pointer-events-none" />
        <svg viewBox={`0 0 ${LOGICAL_W} ${LOGICAL_H}`} onClick={onClickOverlay}
          className="absolute inset-0 w-full h-full cursor-crosshair">
          {/* committed items */}
          {items.map((m) => {
            const xy = m.points.map(toXY)
            if (m.type === "area") {
              return <polygon key={m.id} points={xy.map((p) => `${p.x},${p.y}`).join(" ")}
                fill="rgba(255,235,0,0.25)" stroke="#FFEB00" strokeWidth={3} />
            }
            if (m.type === "line") {
              return <polyline key={m.id} points={xy.map((p) => `${p.x},${p.y}`).join(" ")}
                fill="none" stroke="#00B7FF" strokeWidth={4} />
            }
            const p = xy[0]
            return (
              <g key={m.id}>
                <circle cx={p.x} cy={p.y} r={9} fill="#EF4444" stroke="#fff" strokeWidth={2} />
                <text x={p.x} y={p.y + 4} fontSize={12} fontWeight="bold" fill="#fff" textAnchor="middle">{noteLetter(m.id)}</text>
              </g>
            )
          })}
          {/* in-progress draft */}
          {draft.length > 0 && (
            <>
              {mode === "area"
                ? <polygon points={draft.map(toXY).map((p) => `${p.x},${p.y}`).join(" ")} fill="rgba(255,235,0,0.15)" stroke="#FFEB00" strokeWidth={2} strokeDasharray="6 4" />
                : <polyline points={draft.map(toXY).map((p) => `${p.x},${p.y}`).join(" ")} fill="none" stroke="#00B7FF" strokeWidth={3} strokeDasharray="6 4" />}
              {draft.map(toXY).map((p, i) => <circle key={i} cx={p.x} cy={p.y} r={5} fill="#FFEB00" stroke="#111827" strokeWidth={1.5} />)}
            </>
          )}
        </svg>
        <div className="absolute top-2 right-2 flex flex-col gap-1">
          <button type="button" onClick={() => setZoom((z) => Math.min(21, z + 1))} aria-label="Zoom in"
            className="w-8 h-8 flex items-center justify-center bg-white/90 rounded shadow text-lg font-bold text-gray-700 hover:bg-white">+</button>
          <button type="button" onClick={() => setZoom((z) => Math.max(15, z - 1))} aria-label="Zoom out"
            className="w-8 h-8 flex items-center justify-center bg-white/90 rounded shadow text-lg font-bold text-gray-700 hover:bg-white">−</button>
        </div>
      </div>

      {/* Totals */}
      {(totalArea > 0 || totalLen > 0) && (
        <div className="flex flex-wrap gap-4 text-sm font-semibold text-brand-navy">
          {totalArea > 0 && <span>Total area: {Math.round(totalArea).toLocaleString()} m² <span className="text-gray-400 font-normal">({Math.round(totalArea * 10.7639).toLocaleString()} ft²)</span></span>}
          {totalLen > 0 && <span>Total length: {Math.round(totalLen).toLocaleString()} m</span>}
        </div>
      )}

      {/* Item list */}
      {items.length > 0 && (
        <div className="space-y-1.5">
          {items.map((m) => (
            <div key={m.id} className="flex items-center gap-2 text-sm">
              <span className="w-14 shrink-0 text-xs font-medium text-gray-500 capitalize">
                {m.type === "note" ? `Pin ${noteLetter(m.id)}` : m.type}
              </span>
              {m.type === "note" ? (
                <input value={m.label || ""} onChange={(e) => setLabel(m.id, e.target.value)}
                  placeholder="Annotation (e.g. locked gate, tap here)"
                  className="flex-1 px-2 py-1 border rounded text-sm focus:outline-none focus:ring-1 focus:ring-brand-blue" />
              ) : (
                <span className="flex-1 text-gray-700">{fmtVal(m)}</span>
              )}
              <button onClick={() => removeItem(m.id)} className="p-1 text-gray-300 hover:text-red-600" aria-label="Remove">
                <Trash2 className="w-4 h-4" />
              </button>
            </div>
          ))}
        </div>
      )}

      <label className="flex items-center gap-2 text-sm text-gray-700 cursor-pointer">
        <input type="checkbox" checked={showOnProposal} onChange={(e) => setShowOnProposal(e.target.checked)}
          className="rounded accent-blue-600" />
        Show measurements on the proposal
      </label>

      <div className="flex flex-wrap items-center gap-2">
        <button onClick={save} disabled={saving}
          className="inline-flex items-center gap-2 px-4 py-2 bg-brand-blue text-white rounded-lg text-sm font-semibold hover:bg-blue-700 disabled:opacity-50">
          {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
          Save measurements
        </button>
        <button onClick={clearAll}
          className="inline-flex items-center gap-1.5 px-3 py-2 text-sm text-gray-500 hover:text-red-600 ml-auto">
          <Trash2 className="w-4 h-4" /> Remove all
        </button>
      </div>
    </div>
  )
}
