// Shared read-only render of a job report — used by the editor preview, the
// client-viewable page, and the PDF export. Styled after the classic pest-
// control form document: logo + company block header, brand title bar,
// label/value rows with a tinted label column, brand section headings.

import type { ReactNode } from "react"
import { ZoomableImage } from "@/components/zoomable-image"

export type ReportDocData = {
  organization: {
    name: string
    logoUrl?: string | null
    brandColor: string
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
  { key: "workDone", label: "Work carried out", placeholder: "What you did on this visit" },
  { key: "findings", label: "Findings / activity", placeholder: "What you found — pest activity, condition, issues" },
  { key: "productsUsed", label: "Products / treatments used", placeholder: "Products, quantities, areas treated" },
  { key: "recommendations", label: "Recommendations", placeholder: "Advice for the client / follow-up works" },
  { key: "nextVisit", label: "Next visit / follow-up", placeholder: "When the next visit is due" },
]

function fmtDate(s?: string | null): string {
  if (!s) return ""
  const d = new Date(s)
  return isNaN(d.getTime()) ? "" : d.toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" })
}

// Perceived luminance of the brand colour so bar text flips to stay readable
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
  const barText = brandLuminance(brand) < 0.6 ? "#FFFFFF" : "#0F172A"
  const tint = `${brand}14` // ~8% alpha wash for the label column
  const fields = data.fields || {}
  const has = (k: string) => Boolean(fields[k]?.trim())

  const Heading = ({ children }: { children: ReactNode }) => (
    <h2 className="text-[16px] font-bold mt-6 mb-1.5" style={{ color: brand }}>{children}</h2>
  )
  const Row = ({ label, children }: { label: string; children: ReactNode }) => (
    <div className="flex text-sm border-b border-dotted border-gray-300 break-inside-avoid">
      <div className="w-2/5 sm:w-1/3 shrink-0 px-3 py-2 text-gray-700" style={{ backgroundColor: tint }}>
        {label}
      </div>
      <div className="flex-1 min-w-0 px-3 py-2 text-gray-800 whitespace-pre-wrap">{children}</div>
    </div>
  )

  return (
    <div className="text-gray-800">
      {/* Logo + company block */}
      <div className="flex items-start justify-between gap-4 mb-5">
        {org.logoUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={org.logoUrl} alt={org.name} className="h-16 w-auto object-contain" />
        ) : (
          <div className="text-2xl font-bold" style={{ color: brand }}>{org.name}</div>
        )}
        <div className="text-right text-xs text-gray-600 leading-relaxed">
          <div className="font-semibold text-sm text-gray-800">{org.name}</div>
          {org.phone && <div>{org.phone}</div>}
          {org.email && <div>{org.email}</div>}
          {org.website && <div>{org.website.replace(/^https?:\/\//, "")}</div>}
        </div>
      </div>

      {/* Title bar */}
      <div className="px-3 py-2 font-bold text-[15px] rounded-sm" style={{ backgroundColor: brand, color: barText }}>
        Site Visit Report
      </div>

      <Heading>Customer Details</Heading>
      <div className="border-t border-dotted border-gray-300">
        <Row label="Customer Name">{data.site.clientName}</Row>
        {data.site.clientCompany && <Row label="Company">{data.site.clientCompany}</Row>}
        <Row label="Site Address">{data.site.address}</Row>
      </div>

      <Heading>Visit Summary</Heading>
      <div className="border-t border-dotted border-gray-300">
        <Row label="Date of Visit">{fmtDate(data.visitDate) || "—"}</Row>
        <Row label="Technician">{data.technicianName || "—"}</Row>
        {has("nextVisit") && <Row label="Next visit / follow-up">{fields.nextVisit}</Row>}
      </div>

      {(has("workDone") || has("findings")) && (
        <>
          <Heading>Report and Findings</Heading>
          <div className="border-t border-dotted border-gray-300">
            {has("workDone") && <Row label="Work carried out">{fields.workDone}</Row>}
            {has("findings") && <Row label="Findings / activity">{fields.findings}</Row>}
          </div>
        </>
      )}

      {has("productsUsed") && (
        <>
          <Heading>Products Used</Heading>
          <div className="border border-gray-300 rounded-sm overflow-hidden break-inside-avoid">
            <div className="px-3 py-1.5 text-sm font-semibold" style={{ backgroundColor: brand, color: barText }}>
              Product / treatment details
            </div>
            <div className="px-3 py-2 text-sm whitespace-pre-wrap">{fields.productsUsed}</div>
          </div>
        </>
      )}

      {has("recommendations") && (
        <>
          <Heading>Recommendations</Heading>
          <div className="border-t border-dotted border-gray-300">
            <Row label="Advice / follow-up works">{fields.recommendations}</Row>
          </div>
        </>
      )}

      {data.photos.length > 0 && (
        <>
          <Heading>Photo Evidence</Heading>
          <div className="grid grid-cols-2 gap-3">
            {data.photos.map((p) => (
              <figure key={p.id} className="border border-gray-300 rounded-sm overflow-hidden break-inside-avoid">
                <ZoomableImage
                  src={p.fileUrl}
                  alt={p.caption || "Photo evidence"}
                  caption={p.caption}
                  className="w-full aspect-[4/3] object-cover"
                />
                <figcaption className="text-xs text-gray-600 px-2 py-1.5 border-t border-gray-200" style={{ backgroundColor: tint }}>
                  {p.caption || "Photo evidence"}
                </figcaption>
              </figure>
            ))}
          </div>
        </>
      )}

      {(data.technicianName || data.signatureImage) && (
        <>
          <Heading>Sign-off</Heading>
          <div className="border-t border-dotted border-gray-300">
            <Row label="Technician's Name">{data.technicianName || "—"}</Row>
            {data.signatureImage && (
              <Row label="Technician's Signature">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={data.signatureImage} alt="Signature" className="h-16 w-auto" />
              </Row>
            )}
            {data.signedAt && <Row label="Date Signed">{fmtDate(data.signedAt)}</Row>}
          </div>
        </>
      )}

      {/* Footer */}
      <div className="mt-8 pt-2 flex items-center justify-between text-xs text-gray-500 border-t-4" style={{ borderColor: brand }}>
        <span>Site Visit Report</span>
        <span>Submitted by {org.name}</span>
      </div>
    </div>
  )
}
