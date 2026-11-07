// Photo scope annotations — freehand marks drawn over a survey photo to show
// what's included (green), not included (red) and optional (amber), with
// optional short labels. Points are stored normalised 0..1 against the image
// box, so the overlay lines up at any rendered size. Client-safe.

export type AnnotationKind = "included" | "excluded" | "optional"

export type PhotoAnnotation = {
  id: string
  kind: AnnotationKind
  points: { x: number; y: number }[]
  label?: string
}

export const ANNOTATION_COLORS: Record<AnnotationKind, string> = {
  included: "#10B981",
  excluded: "#EF4444",
  optional: "#F59E0B",
}

export const ANNOTATION_LABELS: Record<AnnotationKind, string> = {
  included: "Included",
  excluded: "Not included",
  optional: "Optional extra",
}

export function parseAnnotations(json: string | null | undefined): PhotoAnnotation[] {
  if (!json) return []
  try {
    const arr = JSON.parse(json)
    return Array.isArray(arr)
      ? arr.filter(
          (a): a is PhotoAnnotation =>
            a && typeof a.id === "string" && a.kind in ANNOTATION_COLORS &&
            Array.isArray(a.points) && a.points.length >= 2
        )
      : []
  } catch {
    return []
  }
}

// SVG overlay stretched over the image box (1000×1000 viewBox,
// preserveAspectRatio none — valid because points are normalised against the
// same box). Rendered identically in the editor, the proposal and PDFs.
export function AnnotationOverlay({ annotations }: { annotations: PhotoAnnotation[] }) {
  if (!annotations.length) return null
  return (
    <svg viewBox="0 0 1000 1000" preserveAspectRatio="none"
      className="absolute inset-0 w-full h-full pointer-events-none">
      {annotations.map((a) => {
        const d = a.points.map((p, i) => `${i === 0 ? "M" : "L"}${(p.x * 1000).toFixed(1)} ${(p.y * 1000).toFixed(1)}`).join(" ")
        const start = a.points[0]
        return (
          <g key={a.id}>
            <path d={d} fill="none" stroke="#ffffff" strokeWidth={18} strokeLinecap="round" strokeLinejoin="round" opacity={0.65} />
            <path d={d} fill="none" stroke={ANNOTATION_COLORS[a.kind]} strokeWidth={10} strokeLinecap="round" strokeLinejoin="round" opacity={0.95} />
            {a.label && (
              <text x={start.x * 1000} y={Math.max(start.y * 1000 - 18, 34)} fontSize={34} fontWeight={700}
                fill={ANNOTATION_COLORS[a.kind]} stroke="#ffffff" strokeWidth={8}
                style={{ paintOrder: "stroke" }}>
                {a.label}
              </text>
            )}
          </g>
        )
      })}
    </svg>
  )
}

// Colour legend for the kinds present on a photo (or a set of photos).
export function AnnotationLegend({ annotations }: { annotations: PhotoAnnotation[] }) {
  const kinds = (Object.keys(ANNOTATION_COLORS) as AnnotationKind[]).filter((k) =>
    annotations.some((a) => a.kind === k)
  )
  if (!kinds.length) return null
  return (
    <span className="flex flex-wrap items-center gap-x-3 gap-y-0.5 text-xs text-gray-500">
      {kinds.map((k) => (
        <span key={k} className="inline-flex items-center gap-1">
          <span className="w-2.5 h-2.5 rounded-full inline-block" style={{ background: ANNOTATION_COLORS[k] }} />
          {ANNOTATION_LABELS[k]}
        </span>
      ))}
    </span>
  )
}
