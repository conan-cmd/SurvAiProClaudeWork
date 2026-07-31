"use client"
/* eslint-disable @typescript-eslint/no-explicit-any */

import { useEffect, useRef, useState } from "react"
import { toast } from "sonner"
import { Loader2, Square, Minus, MapPin, Check, Trash2, Save, Undo2, Hand } from "lucide-react"
import { loadGoogleMaps } from "@/lib/load-google-maps"
import type { Photo } from "@/components/photo-manager"

type LatLng = { lat: number; lng: number }
type MType = "area" | "line" | "note"
type Measurement = { id: string; type: MType; points: LatLng[]; label?: string }

const g = () => (window as any).google

export function SiteMap({
  surveyId,
  latitude,
  longitude,
  savedMeasurements,
  savedShowOnProposal,
  onPhotosChange,
}: {
  surveyId: string
  latitude: number
  longitude: number
  savedMeasurements?: Measurement[] | null
  savedShowOnProposal?: boolean
  onPhotosChange: (photos: Photo[]) => void
}) {
  const divRef = useRef<HTMLDivElement>(null)
  const mapRef = useRef<any>(null)
  const markerRef = useRef<any>(null)
  const overlaysRef = useRef<any[]>([])
  const draftOverlayRef = useRef<any>(null)

  const [ready, setReady] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [items, setItems] = useState<Measurement[]>(savedMeasurements ?? [])
  const [draft, setDraft] = useState<LatLng[]>([])
  const [mode, setMode] = useState<MType | "move">("move")
  const [pin, setPin] = useState<LatLng>({ lat: latitude, lng: longitude })
  const [showOnProposal, setShowOnProposal] = useState(savedShowOnProposal ?? true)
  const [saving, setSaving] = useState(false)

  // keep latest in refs for the map click handler (which closes over stale state)
  const modeRef = useRef(mode)
  modeRef.current = mode

  useEffect(() => {
    let cancelled = false
    loadGoogleMaps()
      .then(() => {
        if (cancelled || !divRef.current) return
        const gm = g().maps
        const map = new gm.Map(divRef.current, {
          center: { lat: latitude, lng: longitude },
          zoom: 20,
          mapTypeId: "hybrid",
          tilt: 0,
          gestureHandling: "greedy", // one-finger pan + pinch-zoom on mobile
          rotateControl: true,
          streetViewControl: false,
          fullscreenControl: false,
          mapTypeControl: true,
        })
        mapRef.current = map
        const marker = new gm.Marker({ position: { lat: latitude, lng: longitude }, map, draggable: true })
        marker.addListener("dragend", () => {
          const p = marker.getPosition()
          setPin({ lat: p.lat(), lng: p.lng() })
        })
        markerRef.current = marker
        map.addListener("click", (e: any) => {
          const ll = { lat: e.latLng.lat(), lng: e.latLng.lng() }
          const m = modeRef.current
          if (m === "note") {
            setItems((it) => [...it, { id: crypto.randomUUID(), type: "note", points: [ll], label: "" }])
          } else if (m === "area" || m === "line") {
            setDraft((d) => [...d, ll])
          }
        })
        setReady(true)
      })
      .catch((e) => setError(e?.message || "Map failed to load"))
    return () => { cancelled = true }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // Redraw committed overlays whenever items change.
  useEffect(() => {
    if (!ready) return
    const gm = g().maps
    overlaysRef.current.forEach((o) => o.setMap(null))
    overlaysRef.current = []
    const notes = items.filter((m) => m.type === "note")
    items.forEach((m) => {
      if (m.type === "area" && m.points.length >= 3) {
        overlaysRef.current.push(new gm.Polygon({ paths: m.points, map: mapRef.current, fillColor: "#FFEB00", fillOpacity: 0.25, strokeColor: "#FFEB00", strokeWeight: 3 }))
      } else if (m.type === "line" && m.points.length >= 2) {
        overlaysRef.current.push(new gm.Polyline({ path: m.points, map: mapRef.current, strokeColor: "#00B7FF", strokeWeight: 4 }))
      } else if (m.type === "note") {
        const letter = String.fromCharCode(65 + (notes.findIndex((n) => n.id === m.id) % 26))
        overlaysRef.current.push(new gm.Marker({ position: m.points[0], map: mapRef.current, label: { text: letter, color: "#fff", fontWeight: "bold" } }))
      }
    })
  }, [items, ready])

  // Redraw the in-progress shape.
  useEffect(() => {
    if (!ready) return
    const gm = g().maps
    if (draftOverlayRef.current) { draftOverlayRef.current.setMap(null); draftOverlayRef.current = null }
    if (draft.length < 1) return
    draftOverlayRef.current = mode === "area"
      ? new gm.Polygon({ paths: draft, map: mapRef.current, fillColor: "#FFEB00", fillOpacity: 0.15, strokeColor: "#FFEB00", strokeWeight: 2 })
      : new gm.Polyline({ path: draft, map: mapRef.current, strokeColor: "#00B7FF", strokeWeight: 3 })
  }, [draft, mode, ready])

  const areaSqm = (pts: LatLng[]) => (pts.length >= 3 ? g().maps.geometry.spherical.computeArea(pts) : 0)
  const lineM = (pts: LatLng[]) => (pts.length >= 2 ? g().maps.geometry.spherical.computeLength(pts) : 0)
  const totalArea = items.filter((m) => m.type === "area").reduce((s, m) => s + areaSqm(m.points), 0)
  const totalLen = items.filter((m) => m.type === "line").reduce((s, m) => s + lineM(m.points), 0)
  const notes = items.filter((m) => m.type === "note")
  const noteLetter = (id: string) => String.fromCharCode(65 + (notes.findIndex((n) => n.id === id) % 26))

  const finishDraft = () => {
    const min = mode === "area" ? 3 : 2
    if (draft.length < min) { toast.error(mode === "area" ? "An area needs 3+ points" : "A line needs 2+ points"); return }
    setItems((it) => [...it, { id: crypto.randomUUID(), type: mode as MType, points: draft }])
    setDraft([])
  }
  const removeItem = (id: string) => setItems((it) => it.filter((m) => m.id !== id))
  const setLabel = (id: string, label: string) => setItems((it) => it.map((m) => (m.id === id ? { ...m, label } : m)))

  const save = async () => {
    setSaving(true)
    try {
      // Persist a moved pin first (so the baked aerial centres correctly).
      if (pin.lat !== latitude || pin.lng !== longitude) {
        const zoom = mapRef.current?.getZoom?.()
        const r = await fetch(`/api/surveys/${surveyId}/imagery`, {
          method: "POST", headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ latitude: pin.lat, longitude: pin.lng, ...(zoom ? { zoom: Math.round(zoom) } : {}) }),
        })
        if (r.ok) { const d = await r.json(); if (d.photos) onPhotosChange(d.photos) }
      }
      const res = await fetch(`/api/surveys/${surveyId}/area`, {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ measurements: items, zoom: Math.round(mapRef.current?.getZoom?.() || 20), showOnProposal }),
      })
      const d = await res.json()
      if (!res.ok) throw new Error(d.error || "Save failed")
      onPhotosChange(d.photos)
      toast.success("Site map saved" + (showOnProposal ? " and added to the proposal" : ""))
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Save failed")
    } finally {
      setSaving(false)
    }
  }

  if (error) {
    return (
      <p className="text-sm text-amber-600">
        Interactive map couldn&apos;t load ({error}). Check the Google Maps key restrictions, or use the standard view.
      </p>
    )
  }

  const modeBtn = (m: MType | "move", Icon: typeof Square, label: string) => (
    <button type="button" onClick={() => { setMode(m); if (m !== "area" && m !== "line") setDraft([]) }}
      className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm font-medium border ${mode === m ? "border-brand-blue bg-blue-50 text-brand-navy" : "border-gray-200 text-gray-600 hover:bg-gray-50"}`}>
      <Icon className="w-4 h-4" /> {label}
    </button>
  )

  return (
    <div className="space-y-3">
      <p className="text-sm text-gray-500">
        Pinch to zoom, drag to pan, use the rotate control to spin. Drag the pin to the property. Pick a tool to draw the area, a line, or drop labelled pins.
      </p>

      <div className="flex flex-wrap gap-2">
        {modeBtn("move", Hand, "Move")}
        {modeBtn("area", Square, "Area")}
        {modeBtn("line", Minus, "Line")}
        {modeBtn("note", MapPin, "Pin")}
        {(mode === "area" || mode === "line") && draft.length > 0 && (
          <>
            <button type="button" onClick={finishDraft}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm font-semibold bg-emerald-600 text-white hover:bg-emerald-700">
              <Check className="w-4 h-4" /> Finish {mode}
            </button>
            <button type="button" onClick={() => setDraft((d) => d.slice(0, -1))}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm font-medium border hover:bg-gray-50">
              <Undo2 className="w-4 h-4" /> Undo point
            </button>
          </>
        )}
      </div>

      <div className="relative rounded-lg overflow-hidden border">
        <div ref={divRef} className="w-full h-[360px] bg-gray-100" />
        {!ready && !error && (
          <div className="absolute inset-0 flex items-center justify-center bg-gray-50">
            <Loader2 className="w-6 h-6 animate-spin text-gray-400" />
          </div>
        )}
      </div>

      {(totalArea > 0 || totalLen > 0) && (
        <div className="flex flex-wrap gap-4 text-sm font-semibold text-brand-navy">
          {totalArea > 0 && <span>Total area: {Math.round(totalArea).toLocaleString()} m² <span className="text-gray-400 font-normal">({Math.round(totalArea * 10.7639).toLocaleString()} ft²)</span></span>}
          {totalLen > 0 && <span>Total length: {Math.round(totalLen).toLocaleString()} m</span>}
        </div>
      )}

      {items.length > 0 && (
        <div className="space-y-1.5">
          {items.map((m) => (
            <div key={m.id} className="flex items-center gap-2 text-sm">
              <span className="w-14 shrink-0 text-xs font-medium text-gray-500 capitalize">
                {m.type === "note" ? `Pin ${noteLetter(m.id)}` : m.type}
              </span>
              {m.type === "note" ? (
                <input value={m.label || ""} onChange={(e) => setLabel(m.id, e.target.value)}
                  placeholder="Annotation (e.g. locked gate)"
                  className="flex-1 px-2 py-1 border rounded text-sm focus:outline-none focus:ring-1 focus:ring-brand-blue" />
              ) : (
                <span className="flex-1 text-gray-700">
                  {m.type === "area" ? `${Math.round(areaSqm(m.points)).toLocaleString()} m²` : `${Math.round(lineM(m.points)).toLocaleString()} m`}
                </span>
              )}
              <button onClick={() => removeItem(m.id)} className="p-1 text-gray-300 hover:text-red-600" aria-label="Remove">
                <Trash2 className="w-4 h-4" />
              </button>
            </div>
          ))}
        </div>
      )}

      <label className="flex items-center gap-2 text-sm text-gray-700 cursor-pointer">
        <input type="checkbox" checked={showOnProposal} onChange={(e) => setShowOnProposal(e.target.checked)} className="rounded accent-blue-600" />
        Show measurements on the proposal
      </label>

      <button onClick={save} disabled={saving || !ready}
        className="inline-flex items-center gap-2 px-4 py-2 bg-brand-blue text-white rounded-lg text-sm font-semibold hover:bg-blue-700 disabled:opacity-50">
        {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />} Save site map
      </button>
    </div>
  )
}
