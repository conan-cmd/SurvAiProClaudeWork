"use client"

import { useRef, useState } from "react"
import { createPortal } from "react-dom"
import { toast } from "sonner"
import { X, Loader2, Undo2, Check } from "lucide-react"
import {
  parseAnnotations,
  AnnotationOverlay,
  ANNOTATION_COLORS,
  ANNOTATION_LABELS,
  type AnnotationKind,
  type PhotoAnnotation,
} from "@/lib/photo-annotations"

// Full-screen scope-marking editor: draw freehand green/red/amber marks over
// a survey photo to show what's included, excluded or optional, with short
// labels. Marks are vectors (the original photo is untouched) and render
// identically on the proposal and in PDFs.
export function PhotoAnnotator({
  surveyId,
  photoId,
  src,
  annotations,
  onClose,
  onSaved,
}: {
  surveyId: string
  photoId: string
  src: string
  annotations: string | null
  onClose: () => void
  onSaved: (annotationsJson: string) => void
}) {
  const [anns, setAnns] = useState<PhotoAnnotation[]>(() => parseAnnotations(annotations))
  const [kind, setKind] = useState<AnnotationKind>("included")
  const [labelFor, setLabelFor] = useState<string | null>(null)
  const [labelText, setLabelText] = useState("")
  const [saving, setSaving] = useState(false)
  const boxRef = useRef<HTMLDivElement | null>(null)
  const stroke = useRef<{ x: number; y: number }[] | null>(null)
  const [, bump] = useState(0) // re-render while drawing

  const norm = (e: React.PointerEvent) => {
    const rect = boxRef.current!.getBoundingClientRect()
    return {
      x: Math.min(1, Math.max(0, (e.clientX - rect.left) / rect.width)),
      y: Math.min(1, Math.max(0, (e.clientY - rect.top) / rect.height)),
    }
  }

  const down = (e: React.PointerEvent) => {
    if (!boxRef.current) return
    ;(e.target as Element).setPointerCapture?.(e.pointerId)
    stroke.current = [norm(e)]
    setLabelFor(null)
  }
  const move = (e: React.PointerEvent) => {
    if (!stroke.current) return
    const p = norm(e)
    const last = stroke.current[stroke.current.length - 1]
    if (Math.hypot(p.x - last.x, p.y - last.y) > 0.004) {
      stroke.current.push(p)
      bump((n) => n + 1)
    }
  }
  const up = () => {
    if (!stroke.current) return
    if (stroke.current.length >= 3) {
      const id = `a-${Date.now()}`
      setAnns((prev) => [...prev, { id, kind, points: stroke.current! }])
      setLabelFor(id)
      setLabelText("")
    }
    stroke.current = null
    bump((n) => n + 1)
  }

  const applyLabel = () => {
    if (labelFor && labelText.trim()) {
      setAnns((prev) => prev.map((a) => (a.id === labelFor ? { ...a, label: labelText.trim().slice(0, 40) } : a)))
    }
    setLabelFor(null)
    setLabelText("")
  }

  const save = async () => {
    setSaving(true)
    try {
      const res = await fetch(`/api/surveys/${surveyId}/photos/${photoId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ annotations: JSON.stringify(anns) }),
      })
      if (!res.ok) throw new Error((await res.json()).error || "Couldn't save")
      toast.success(anns.length ? "Annotations saved — they'll show on the proposal" : "Annotations cleared")
      onSaved(JSON.stringify(anns))
      onClose()
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Couldn't save the annotations")
    } finally {
      setSaving(false)
    }
  }

  const live: PhotoAnnotation[] = stroke.current && stroke.current.length >= 2
    ? [...anns, { id: "live", kind, points: stroke.current }]
    : anns

  return createPortal(
    <div className="fixed inset-0 z-50 bg-black/90 flex flex-col overscroll-contain">
      <div className="flex items-center justify-between gap-2 p-3 text-white">
        <p className="text-sm font-semibold">Mark the scope — draw around areas</p>
        <button onClick={onClose} disabled={saving} aria-label="Close"
          className="p-1.5 text-white/70 hover:text-white"><X className="w-5 h-5" /></button>
      </div>

      {/* Tool picker */}
      <div className="flex flex-wrap items-center justify-center gap-2 px-3 pb-2">
        {(Object.keys(ANNOTATION_COLORS) as AnnotationKind[]).map((k) => (
          <button key={k} type="button" onClick={() => setKind(k)}
            className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-sm font-semibold border-2 transition ${
              kind === k ? "border-white text-white" : "border-transparent text-white/60 hover:text-white"
            }`}
            style={{ background: `${ANNOTATION_COLORS[k]}33` }}>
            <span className="w-3 h-3 rounded-full" style={{ background: ANNOTATION_COLORS[k] }} />
            {ANNOTATION_LABELS[k]}
          </button>
        ))}
      </div>

      {/* Canvas */}
      <div className="flex-1 min-h-0 flex items-center justify-center p-3">
        <div ref={boxRef} className="relative inline-block max-w-full max-h-full select-none"
          style={{ touchAction: "none" }}
          onPointerDown={down} onPointerMove={move} onPointerUp={up} onPointerCancel={up}>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={src} alt="Annotate" draggable={false}
            className="max-h-[62dvh] max-w-full w-auto h-auto rounded-lg pointer-events-none" />
          <AnnotationOverlay annotations={live} />
        </div>
      </div>

      {/* Label prompt for the mark just drawn */}
      {labelFor && (
        <div className="px-3 pb-2 flex items-center justify-center gap-2">
          <input autoFocus value={labelText} onChange={(e) => setLabelText(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && applyLabel()}
            placeholder="Label this area (optional) — e.g. rear gutter"
            className="w-full max-w-sm text-sm px-3 py-2 rounded-lg bg-white/95 focus:outline-none" />
          <button type="button" onClick={applyLabel}
            className="px-3 py-2 bg-white/20 text-white rounded-lg text-sm font-semibold hover:bg-white/30">
            {labelText.trim() ? "Add label" : "Skip"}
          </button>
        </div>
      )}

      {/* Existing marks + actions */}
      <div className="px-3 pb-4 space-y-2">
        {anns.length > 0 && (
          <div className="flex flex-wrap justify-center gap-1.5">
            {anns.map((a, i) => (
              <span key={a.id} className="inline-flex items-center gap-1.5 text-xs font-medium text-white/90 bg-white/10 rounded-full pl-2.5 pr-1 py-1">
                <span className="w-2.5 h-2.5 rounded-full" style={{ background: ANNOTATION_COLORS[a.kind] }} />
                {a.label || `${ANNOTATION_LABELS[a.kind]} ${i + 1}`}
                <button type="button" aria-label="Remove mark"
                  onClick={() => setAnns((prev) => prev.filter((x) => x.id !== a.id))}
                  className="p-0.5 text-white/50 hover:text-white"><X className="w-3 h-3" /></button>
              </span>
            ))}
          </div>
        )}
        <div className="flex items-center justify-center gap-2">
          <button type="button" onClick={() => setAnns((prev) => prev.slice(0, -1))} disabled={!anns.length || saving}
            className="inline-flex items-center gap-1.5 px-4 py-2.5 bg-white/15 text-white rounded-lg text-sm font-semibold hover:bg-white/25 disabled:opacity-40">
            <Undo2 className="w-4 h-4" /> Undo
          </button>
          <button type="button" onClick={save} disabled={saving}
            className="inline-flex items-center gap-2 px-6 py-2.5 bg-brand-blue text-white rounded-lg text-sm font-semibold hover:bg-blue-700 disabled:opacity-50">
            {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Check className="w-4 h-4" />} Save
          </button>
        </div>
      </div>
    </div>,
    document.body
  )
}
