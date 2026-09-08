// Shared read-only render of a job report — used by the editor preview, the
// client-viewable page, and the PDF export. Styled after LBC's "Job Sheet"
// document: dark brand header band with reference, status card, labelled
// details grid, callout boxes for observations/recommendations, treatment
// record, framed sign-off and a company footer band.

import { ZoomableImage } from "@/components/zoomable-image"

export type ReportDocData = {
  // Report id — used to derive the reference shown on the sheet.
  id?: string | null
  status?: string | null
  organization: {
    name: string
    logoUrl?: string | null
    brandColor: string
    secondaryColor?: string | null
    phone?: string | null
    email?: string | null
    website?: string | null
  }
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
  { key: "summary", label: "Job summary", placeholder: "One-paragraph overview shown at the top of the report" },
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

// Perceived luminance so band/callout text flips to stay readable on light
// brand colours (same approach as the proposal cover).
function lum(hex: string): number {
  const r = parseInt(hex.slice(1, 3), 16) / 255
  const g = parseInt(hex.slice(3, 5), 16) / 255
  const b = parseInt(hex.slice(5, 7), 16) / 255
  return 0.299 * r + 0.587 * g + 0.114 * b
}
const validHex = (h?: string | null) => (h && /^#[0-9A-Fa-f]{6}$/.test(h) ? h : null)

export function JobReportDocument({ data }: { data: ReportDocData }) {
  const org = data.organization
  const brand = validHex(org.brandColor) || "#0F172A"
  const accent = validHex(org.secondaryColor) || "#C9A227"
  const onBrand = lum(brand) < 0.6 ? "#FFFFFF" : "#0F172A"
  // Bold values in the details grid pick up the brand colour when it's dark
  // enough to read on white.
  const valueColor = lum(brand) < 0.55 ? brand : "#1F2937"
  const fields = data.fields || {}
  const has = (k: string) => Boolean(fields[k]?.trim())
  const completed = data.status === "COMPLETED"
  const reference = data.id
    ? `JS-${(data.visitDate || "").slice(2, 4)}${(data.visitDate || "").slice(5, 7)}-${data.id.slice(-4).toUpperCase()}`
    : null

  const SectionHead = ({ children }: { children: string }) => (
    <div className="mt-7 mb-3">
      <h2 className="text-[13px] font-bold tracking-[0.14em] uppercase text-gray-800">{children}</h2>
      <div className="h-[3px] w-full mt-1.5" style={{ background: `linear-gradient(to right, ${accent} 120px, #E5E7EB 120px)` }} />
    </div>
  )
  const Cell = ({ label, value, wide }: { label: string; value: string; wide?: boolean }) => (
    <div className={`px-3.5 py-2.5 bg-gray-50 border border-gray-200 ${wide ? "col-span-2 sm:col-span-3" : ""}`}>
      <div className="text-[9px] font-semibold uppercase tracking-[0.12em] text-gray-400">{label}</div>
      <div className="text-sm font-bold mt-0.5" style={{ color: valueColor }}>{value}</div>
    </div>
  )

  return (
    <div className="text-gray-800">
      {/* Header band */}
      <div className="rounded-t-lg overflow-hidden" style={{ backgroundColor: brand, color: onBrand }}>
        <div className="flex items-center justify-between gap-4 px-6 py-5">
          {org.logoUrl ? (
            <div className="bg-white rounded-md p-2 shadow-sm">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={org.logoUrl} alt={org.name} className="h-10 w-auto object-contain" />
            </div>
          ) : (
            <div className="font-bold text-xl">{org.name}</div>
          )}
          <div className="text-right">
            <div className="text-xl font-extrabold tracking-[0.08em]">JOB SHEET</div>
            <div className="text-xs mt-0.5" style={{ opacity: 0.85 }}>Visit report — {data.site.clientName}</div>
            {reference && <div className="text-xs" style={{ opacity: 0.85 }}>Ref {reference}</div>}
          </div>
        </div>
        <div className="h-1.5" style={{ backgroundColor: accent }} />
      </div>

      {/* Title + status card */}
      <div className="flex flex-wrap items-start justify-between gap-4 mt-6">
        <div className="min-w-0 flex-1" style={{ minWidth: "240px" }}>
          <h1 className="text-2xl font-bold text-gray-900 leading-tight">
            {data.site.clientName}
            {data.site.clientCompany ? <span className="text-gray-400 font-semibold"> · {data.site.clientCompany}</span> : ""}
          </h1>
          <div className="text-sm text-gray-500 mt-1">{data.site.address}</div>
          {has("summary") && (
            <p className="text-sm text-gray-700 leading-relaxed mt-3 whitespace-pre-wrap">{fields.summary}</p>
          )}
        </div>
        <div className="rounded-lg px-6 py-4 text-center shrink-0" style={{ backgroundColor: brand, color: onBrand }}>
          <div className="text-[9px] font-semibold uppercase tracking-[0.18em]" style={{ opacity: 0.8 }}>Job status</div>
          <div className="text-xl font-extrabold tracking-wide mt-0.5">{completed ? "COMPLETED" : "IN PROGRESS"}</div>
          <div className="text-xs mt-0.5" style={{ opacity: 0.85 }}>Visited {fmtDate(data.visitDate)}</div>
        </div>
      </div>

      {/* Job details grid */}
      <SectionHead>Job details</SectionHead>
      <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
        <Cell label="Prepared for" value={data.site.clientCompany || data.site.clientName} />
        {reference && <Cell label="Reference" value={reference} />}
        <Cell label="Date of visit" value={fmtDate(data.visitDate) || "—"} />
        <Cell label="Technician" value={data.technicianName || "—"} />
        <Cell label="Job status" value={completed ? "Completed" : "In progress"} />
        {has("nextVisit") && <Cell label="Next visit / follow-up" value={fields.nextVisit} />}
        <Cell label="Site location" value={data.site.address} wide />
      </div>

      {has("workDone") && (
        <>
          <SectionHead>Work carried out</SectionHead>
          <p className="text-sm text-gray-700 leading-relaxed whitespace-pre-wrap">{fields.workDone}</p>
        </>
      )}

      {has("findings") && (
        <div className="mt-6 rounded-r-lg border-l-4 px-4 py-3 break-inside-avoid"
          style={{ borderColor: accent, backgroundColor: `${accent}14` }}>
          <div className="text-[11px] font-bold uppercase tracking-[0.12em]" style={{ color: lum(accent) < 0.55 ? accent : "#7A5A00" }}>
            Observations — findings on site
          </div>
          <p className="text-sm text-gray-800 leading-relaxed whitespace-pre-wrap mt-1.5 mb-0">{fields.findings}</p>
        </div>
      )}

      {has("recommendations") && (
        <div className="mt-4 rounded-lg px-4 py-3 break-inside-avoid" style={{ backgroundColor: brand, color: onBrand }}>
          <div className="text-[11px] font-bold uppercase tracking-[0.12em]" style={{ opacity: 0.85 }}>Recommendations</div>
          <p className="text-sm leading-relaxed whitespace-pre-wrap mt-1.5 mb-0">{fields.recommendations}</p>
        </div>
      )}

      {has("productsUsed") && (
        <>
          <SectionHead>Treatment record</SectionHead>
          <div className="border border-gray-300 rounded-md overflow-hidden break-inside-avoid">
            <div className="px-3.5 py-1.5 text-[11px] font-bold uppercase tracking-[0.1em]"
              style={{ backgroundColor: brand, color: onBrand }}>
              Products / treatments used
            </div>
            <p className="px-3.5 py-2.5 text-sm whitespace-pre-wrap m-0">{fields.productsUsed}</p>
          </div>
        </>
      )}

      {data.photos.length > 0 && (
        <>
          <SectionHead>Site photographs</SectionHead>
          <div className="grid grid-cols-2 gap-3">
            {data.photos.map((p) => (
              <figure key={p.id} className="break-inside-avoid m-0">
                <ZoomableImage
                  src={p.fileUrl}
                  alt={p.caption || "Site photograph"}
                  caption={p.caption}
                  className="w-full aspect-[4/3] rounded-md border object-cover"
                />
                {p.caption && (
                  <figcaption className="text-[11px] text-gray-500 text-center mt-1.5">{p.caption}</figcaption>
                )}
              </figure>
            ))}
          </div>
        </>
      )}

      {(data.technicianName || data.signatureImage) && (
        <div className="mt-8 rounded-lg border border-gray-300 p-5 break-inside-avoid">
          <div className="text-[9px] font-semibold uppercase tracking-[0.14em] text-gray-400">Job completion sign-off</div>
          <p className="text-sm text-gray-700 mt-2">
            The work described above was carried out
            {data.technicianName ? <> by <strong>{data.technicianName}</strong></> : ""} on {fmtDate(data.visitDate)}.
          </p>
          <div className="flex flex-wrap items-end gap-x-10 gap-y-4 mt-4">
            <div>
              {data.signatureImage ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={data.signatureImage} alt="Signature" className="h-14 w-auto" />
              ) : (
                <div className="h-14" />
              )}
              <div className="border-t border-gray-400 pt-1 mt-1 text-[10px] font-semibold uppercase tracking-wider text-gray-500 min-w-[220px]">
                {data.technicianName || "Technician"}
              </div>
            </div>
            <div>
              <div className="h-14 flex items-end text-sm text-gray-800">{fmtDate(data.signedAt || data.visitDate)}</div>
              <div className="border-t border-gray-400 pt-1 mt-1 text-[10px] font-semibold uppercase tracking-wider text-gray-500 min-w-[160px]">
                Date
              </div>
            </div>
          </div>
        </div>
      )}

      {(org.phone || org.email) && (
        <div className="mt-5 rounded-r-lg border-l-4 bg-gray-50 px-4 py-3 break-inside-avoid" style={{ borderColor: brand }}>
          <div className="text-[11px] font-bold uppercase tracking-[0.12em] text-gray-700">Any questions?</div>
          <p className="text-sm text-gray-600 mt-1 mb-0">
            If you have any questions about this report, contact {org.name}
            {org.phone ? ` on ${org.phone}` : ""}{org.email ? ` or email ${org.email}` : ""} — we&apos;ll be happy to help.
          </p>
        </div>
      )}

      {/* Footer band */}
      <div className="mt-8 rounded-b-lg px-5 py-3 text-[11px] flex flex-wrap items-center justify-between gap-2"
        style={{ backgroundColor: brand, color: onBrand }}>
        <span className="font-semibold">{org.name}</span>
        <span style={{ opacity: 0.85 }}>
          {[org.phone, org.email, org.website?.replace(/^https?:\/\//, "")].filter(Boolean).join(" · ")}
        </span>
      </div>
    </div>
  )
}
