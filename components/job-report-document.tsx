// Shared read-only render of a job report — used by the editor preview, the
// client-viewable page, and the PDF export.

import { ZoomableImage } from "@/components/zoomable-image"

export type ReportDocData = {
  organization: { name: string; logoUrl?: string | null; brandColor: string; phone?: string | null; email?: string | null }
  site: { clientName: string; clientCompany?: string | null; address: string }
  visitDate: string
  fields: Record<string, string>
  photos: { id: string; fileUrl: string; caption?: string | null }[]
  technicianName?: string | null
  signatureImage?: string | null
  signedAt?: string | null
}

// Fixed field set for now — Phase 3 makes these customisable per organisation.
export const REPORT_FIELDS: { key: string; label: string; placeholder?: string }[] = [
  { key: "workDone", label: "Work carried out", placeholder: "What you did on this visit" },
  { key: "findings", label: "Findings / activity", placeholder: "What you found — pest activity, condition, issues" },
  { key: "productsUsed", label: "Products / treatments used", placeholder: "Products, quantities, areas treated" },
  { key: "recommendations", label: "Recommendations", placeholder: "Advice for the client / follow-up works" },
  { key: "nextVisit", label: "Next visit / follow-up", placeholder: "When the next visit is due" },
]

function fmtDate(s?: string | null): string {
  if (!s) return ""
  const d = new Date(s)
  return isNaN(d.getTime()) ? "" : d.toLocaleDateString("en-GB", { day: "numeric", month: "long", year: "numeric" })
}

// Perceived luminance of the brand colour so cover text flips to stay readable
// on light brands (same approach as the proposal cover).
function brandLuminance(hex: string): number {
  const r = parseInt(hex.slice(1, 3), 16) / 255
  const g = parseInt(hex.slice(3, 5), 16) / 255
  const b = parseInt(hex.slice(5, 7), 16) / 255
  return 0.299 * r + 0.587 * g + 0.114 * b
}

export function JobReportDocument({ data }: { data: ReportDocData }) {
  const org = data.organization
  const brand = /^#[0-9A-Fa-f]{6}$/.test(org.brandColor) ? org.brandColor : "#0F172A"
  const onDark = brandLuminance(brand) < 0.6
  const bandText = onDark ? "#FFFFFF" : "#0F172A"
  const fields = data.fields || {}
  const sections = REPORT_FIELDS.filter((f) => fields[f.key]?.trim())

  return (
    <div className="text-gray-800">
      {/* Branded cover band */}
      <div className="rounded-xl overflow-hidden mb-6" style={{ backgroundColor: brand, color: bandText }}>
        <div className="p-6 md:p-8">
          <div className="flex items-start justify-between gap-4">
            {org.logoUrl ? (
              <div className="inline-block bg-white rounded-lg p-2 shadow-sm">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={org.logoUrl} alt={org.name} className="h-10 w-auto object-contain" />
              </div>
            ) : (
              <div className="font-bold text-xl">{org.name}</div>
            )}
            <div className="text-right text-xs leading-relaxed" style={{ opacity: 0.85 }}>
              <div className="font-semibold text-sm" style={{ opacity: 1 }}>{org.name}</div>
              {org.phone && <div>{org.phone}</div>}
              {org.email && <div>{org.email}</div>}
            </div>
          </div>
          <div className="mt-7 text-[11px] font-semibold uppercase tracking-[0.25em]" style={{ opacity: 0.75 }}>
            Visit report
          </div>
          <h1 className="text-3xl font-bold mt-1 leading-tight">
            {data.site.clientName}
            {data.site.clientCompany ? <span style={{ opacity: 0.8 }}> · {data.site.clientCompany}</span> : ""}
          </h1>
          <div className="mt-1 text-sm" style={{ opacity: 0.9 }}>{data.site.address}</div>
        </div>
      </div>

      {/* Key facts */}
      <div className="grid grid-cols-2 md:grid-cols-3 gap-3 mb-7">
        <div className="rounded-lg border bg-gray-50 px-3.5 py-2.5">
          <div className="text-[10px] font-semibold uppercase tracking-wider text-gray-400">Visit date</div>
          <div className="text-sm font-semibold text-gray-800 mt-0.5">{fmtDate(data.visitDate) || "—"}</div>
        </div>
        <div className="rounded-lg border bg-gray-50 px-3.5 py-2.5">
          <div className="text-[10px] font-semibold uppercase tracking-wider text-gray-400">Technician</div>
          <div className="text-sm font-semibold text-gray-800 mt-0.5">{data.technicianName || "—"}</div>
        </div>
        <div className="rounded-lg border bg-gray-50 px-3.5 py-2.5 col-span-2 md:col-span-1">
          <div className="text-[10px] font-semibold uppercase tracking-wider text-gray-400">Site</div>
          <div className="text-sm font-semibold text-gray-800 mt-0.5 truncate">{data.site.address}</div>
        </div>
      </div>

      {/* Report body */}
      {sections.map((f) => (
        <section key={f.key} className="mb-6 break-inside-avoid">
          <h2 className="flex items-center gap-2.5 font-bold text-[15px] text-gray-900">
            <span className="inline-block w-1.5 h-5 rounded-full shrink-0" style={{ backgroundColor: brand }} />
            {f.label}
          </h2>
          <p className="text-sm whitespace-pre-wrap text-gray-700 leading-relaxed mt-2 pl-4">{fields[f.key]}</p>
        </section>
      ))}

      {data.photos.length > 0 && (
        <section className="mb-6">
          <h2 className="flex items-center gap-2.5 font-bold text-[15px] text-gray-900 mb-3">
            <span className="inline-block w-1.5 h-5 rounded-full shrink-0" style={{ backgroundColor: brand }} />
            Photos from this visit
          </h2>
          <div className="grid grid-cols-2 gap-3 pl-4">
            {data.photos.map((p) => (
              <figure key={p.id} className="break-inside-avoid">
                <ZoomableImage
                  src={p.fileUrl}
                  alt={p.caption || "Job photo"}
                  caption={p.caption}
                  className="w-full aspect-[4/3] rounded-lg border object-cover"
                />
                {p.caption && <figcaption className="text-xs text-gray-500 mt-1.5">{p.caption}</figcaption>}
              </figure>
            ))}
          </div>
        </section>
      )}

      {(data.technicianName || data.signatureImage) && (
        <section className="mt-8 break-inside-avoid">
          <div className="rounded-xl border bg-gray-50 p-4 md:p-5 flex flex-wrap items-end justify-between gap-4">
            <div>
              <div className="text-[10px] font-semibold uppercase tracking-wider text-gray-400">Completed &amp; signed by</div>
              <div className="font-bold text-gray-900 mt-1">{data.technicianName || "—"}</div>
              {data.signedAt && <div className="text-xs text-gray-500 mt-0.5">{fmtDate(data.signedAt)}</div>}
            </div>
            {data.signatureImage && (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={data.signatureImage} alt="Signature" className="h-16 bg-white border rounded-lg px-3 py-1" />
            )}
          </div>
        </section>
      )}

      {/* Footer strip */}
      <div className="mt-8 pt-3 text-center text-xs text-gray-400 border-t-2" style={{ borderColor: brand }}>
        {org.name}
        {org.phone ? ` · ${org.phone}` : ""}
        {org.email ? ` · ${org.email}` : ""}
      </div>
    </div>
  )
}
