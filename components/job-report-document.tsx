// Shared read-only render of a job report — used by the editor preview, the
// client-viewable page, and the PDF export.

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

export function JobReportDocument({ data }: { data: ReportDocData }) {
  const org = data.organization
  const brand = /^#[0-9A-Fa-f]{6}$/.test(org.brandColor) ? org.brandColor : "#0F172A"
  const fields = data.fields || {}

  return (
    <div className="text-gray-800">
      <div className="flex items-center justify-between gap-3 pb-4 mb-4 border-b-4" style={{ borderColor: brand }}>
        <div className="flex items-center gap-3">
          {org.logoUrl && (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={org.logoUrl} alt="" className="h-10 w-auto object-contain" />
          )}
          <div className="font-bold text-lg" style={{ color: brand }}>{org.name}</div>
        </div>
        <div className="text-right text-xs text-gray-500">
          {org.phone && <div>{org.phone}</div>}
          {org.email && <div>{org.email}</div>}
        </div>
      </div>

      <h1 className="text-2xl font-bold mb-2" style={{ color: brand }}>Job Report</h1>
      <div className="text-sm text-gray-600 mb-5 space-y-0.5">
        <div><span className="text-gray-400">Client:</span> {data.site.clientName}{data.site.clientCompany ? `, ${data.site.clientCompany}` : ""}</div>
        <div><span className="text-gray-400">Site:</span> {data.site.address}</div>
        <div><span className="text-gray-400">Visit date:</span> {fmtDate(data.visitDate)}</div>
      </div>

      {REPORT_FIELDS.map((f) => {
        const v = fields[f.key]
        if (!v || !v.trim()) return null
        return (
          <section key={f.key} className="mb-4 break-inside-avoid">
            <h2 className="font-semibold text-brand-navy">{f.label}</h2>
            <p className="text-sm whitespace-pre-wrap text-gray-700">{v}</p>
          </section>
        )
      })}

      {data.photos.length > 0 && (
        <section className="mb-4">
          <h2 className="font-semibold text-brand-navy mb-2">Photos</h2>
          <div className="grid grid-cols-2 gap-3">
            {data.photos.map((p) => (
              <figure key={p.id} className="break-inside-avoid">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={p.fileUrl} alt={p.caption || "Job photo"} className="w-full rounded-lg border object-cover" />
                {p.caption && <figcaption className="text-xs text-gray-500 mt-1">{p.caption}</figcaption>}
              </figure>
            ))}
          </div>
        </section>
      )}

      {(data.technicianName || data.signatureImage) && (
        <section className="mt-6 pt-4 border-t break-inside-avoid">
          <div className="text-sm text-gray-600">
            Completed by <strong>{data.technicianName || ""}</strong>{data.signedAt ? ` on ${fmtDate(data.signedAt)}` : ""}
          </div>
          {data.signatureImage && (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={data.signatureImage} alt="Signature" className="h-14 mt-2" />
          )}
        </section>
      )}
    </div>
  )
}
