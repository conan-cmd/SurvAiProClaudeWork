"use client"

import { useEffect, useRef, useState } from "react"
import { useParams } from "next/navigation"
import { toast } from "sonner"
import { Loader2, AlertTriangle, Printer, Copy, MessageCircle, Share2, MapPin } from "lucide-react"
import { ZoomableImage } from "@/components/zoomable-image"

type WoData = {
  clientName: string
  status: string
  signedAt: string | null
  signedName: string | null
  lineItems: { id: string; description: string; quantity: number; unit: string; isOptional: boolean; selected: boolean }[]
  survey: {
    title: string
    clientAddress: string
    what3words: string | null
    accessNotes: string | null
    waterSupply: string | null
    chemicalsRequired: string | null
    measurements: string | null
    exclusions: string | null
    areaSqm: number | null
    linearMeters: number | null
    photos: { id: string; fileUrl: string; caption: string | null; internalOnly: boolean }[]
  }
  organization: {
    name: string
    logoUrl: string | null
    brandColor: string
    secondaryColor: string | null
    phone: string | null
    email: string | null
  }
}

function lum(hex: string): number {
  const r = parseInt(hex.slice(1, 3), 16) / 255
  const g = parseInt(hex.slice(3, 5), 16) / 255
  const b = parseInt(hex.slice(5, 7), 16) / 255
  return 0.299 * r + 0.587 * g + 0.114 * b
}

// Crew-facing works order: the signed scope of works — exactly what was sold,
// what wasn't, and everything the team needs to find and do the job.
export default function WorksOrderPage() {
  const { token } = useParams<{ token: string }>()
  const [data, setData] = useState<WoData | null>(null)
  const [notFound, setNotFound] = useState(false)
  const [pdfBusy, setPdfBusy] = useState(false)
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    fetch(`/api/wo/${token}`)
      .then((r) => { if (!r.ok) throw new Error(); return r.json() })
      .then(setData)
      .catch(() => setNotFound(true))
  }, [token])

  const copyLink = async () => {
    try {
      await navigator.clipboard.writeText(window.location.href)
      toast.success("Link copied")
    } catch {
      toast.error("Couldn't copy — use your browser's share instead")
    }
  }

  const downloadPdf = async () => {
    if (!ref.current || !data) return
    setPdfBusy(true)
    try {
      const { exportAndShare } = await import("@/lib/pdf")
      const base = `${data.survey.title}-works-order`.replace(/[^a-z0-9]+/gi, "-").replace(/^-|-$/g, "")
      await exportAndShare(ref.current, `${base || "works-order"}.pdf`, "Works Order")
    } catch {
      toast.error("Couldn't create the PDF — try your browser's print.")
    } finally {
      setPdfBusy(false)
    }
  }

  if (notFound) {
    return (
      <div className="min-h-screen flex items-center justify-center p-6 text-center">
        <div>
          <AlertTriangle className="w-10 h-10 text-amber-500 mx-auto mb-3" />
          <p className="text-gray-600">This works order link is no longer valid.</p>
        </div>
      </div>
    )
  }
  if (!data) {
    return <div className="min-h-screen flex items-center justify-center"><Loader2 className="w-8 h-8 animate-spin text-gray-400" /></div>
  }

  const org = data.organization
  const brand = /^#[0-9A-Fa-f]{6}$/.test(org.brandColor) ? org.brandColor : "#0F172A"
  const accent = org.secondaryColor && /^#[0-9A-Fa-f]{6}$/.test(org.secondaryColor) ? org.secondaryColor : "#C9A227"
  const onBrand = lum(brand) < 0.6 ? "#FFFFFF" : "#0F172A"
  const signed = Boolean(data.signedAt)
  const s = data.survey
  const sold = data.lineItems.filter((i) => i.selected)
  const notSold = data.lineItems.filter((i) => !i.selected)
  const waMsg = `Works order — ${s.title}, ${s.clientAddress}: ${typeof window !== "undefined" ? window.location.href : ""}`

  const Head = ({ children }: { children: string }) => (
    <div className="mt-7 mb-3">
      <h2 className="text-[13px] font-bold tracking-[0.14em] uppercase text-gray-800">{children}</h2>
      <div className="h-[3px] w-full mt-1.5" style={{ background: `linear-gradient(to right, ${accent} 120px, #E5E7EB 120px)` }} />
    </div>
  )
  const InfoRow = ({ label, value }: { label: string; value: string }) => (
    <div className="px-3.5 py-2.5 bg-gray-50 border border-gray-200">
      <div className="text-[9px] font-semibold uppercase tracking-[0.12em] text-gray-400">{label}</div>
      <div className="text-sm font-bold mt-0.5 text-gray-800 whitespace-pre-wrap">{value}</div>
    </div>
  )

  return (
    <main className="min-h-screen bg-gray-50 py-6 px-3 md:py-10">
      <div className="max-w-3xl mx-auto">
        <div className="no-print flex flex-wrap justify-end gap-2 mb-3">
          <button onClick={copyLink}
            className="inline-flex items-center gap-1.5 px-3 py-2 border rounded-lg text-sm font-medium bg-white hover:bg-gray-50">
            <Copy className="w-4 h-4" /> Copy link
          </button>
          <a href={`https://wa.me/?text=${encodeURIComponent(waMsg)}`} target="_blank" rel="noopener noreferrer"
            className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg text-sm font-semibold bg-[#25D366] text-white hover:brightness-95">
            <MessageCircle className="w-4 h-4" /> WhatsApp
          </a>
          {typeof navigator !== "undefined" && !!navigator.share && (
            <button onClick={() => navigator.share({ title: "Works order", url: window.location.href }).catch(() => {})}
              className="inline-flex items-center gap-1.5 px-3 py-2 border rounded-lg text-sm font-medium bg-white hover:bg-gray-50">
              <Share2 className="w-4 h-4" /> Share
            </button>
          )}
          <button onClick={downloadPdf} disabled={pdfBusy}
            className="inline-flex items-center gap-1.5 px-3 py-2 bg-brand-blue text-white rounded-lg text-sm font-semibold hover:bg-blue-700 disabled:opacity-50">
            {pdfBusy ? <Loader2 className="w-4 h-4 animate-spin" /> : <Printer className="w-4 h-4" />} PDF
          </button>
        </div>

        <div ref={ref} className="bg-white rounded-xl shadow-sm p-4 md:p-8 print-area text-gray-800">
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
                <div className="text-xl font-extrabold tracking-[0.08em]">WORKS ORDER</div>
                <div className="text-xs mt-0.5" style={{ opacity: 0.85 }}>Internal — scope of works for the team</div>
              </div>
            </div>
            <div className="h-1.5" style={{ backgroundColor: accent }} />
          </div>

          {/* Signed / draft banner */}
          <div className={`mt-4 rounded-lg px-4 py-3 text-sm font-semibold ${
            signed ? "bg-emerald-50 text-emerald-800 border border-emerald-200" : "bg-amber-50 text-amber-800 border border-amber-300"
          }`}>
            {signed
              ? `SIGNED SCOPE — agreed by ${data.signedName || data.clientName} on ${new Date(data.signedAt!).toLocaleDateString("en-GB", { day: "numeric", month: "long", year: "numeric" })}. Carry out exactly what's listed below.`
              : "DRAFT — this proposal has not been signed yet. Scope may still change; check before starting work."}
          </div>

          <h1 className="text-2xl font-bold text-gray-900 mt-5 leading-tight">{s.title}</h1>
          <div className="text-sm text-gray-500 mt-1 flex items-center gap-1.5">
            <MapPin className="w-4 h-4 shrink-0" /> {s.clientAddress}
            {s.what3words && <span className="text-gray-400">· ///{s.what3words}</span>}
          </div>

          <Head>Agreed works — carry out</Head>
          <div className="border border-gray-300 rounded-md overflow-hidden">
            <div className="grid grid-cols-[1fr_auto] px-3.5 py-1.5 text-[11px] font-bold uppercase tracking-[0.1em]"
              style={{ backgroundColor: brand, color: onBrand }}>
              <span>Work item</span><span>Quantity</span>
            </div>
            {sold.map((i) => (
              <div key={i.id} className="grid grid-cols-[1fr_auto] gap-3 px-3.5 py-2.5 border-t border-gray-200 text-sm">
                <span>
                  {i.description}
                  {i.isOptional && (
                    <span className="ml-2 text-[10px] font-bold uppercase tracking-wide px-1.5 py-0.5 rounded-full bg-emerald-50 text-emerald-700">
                      extra — client selected
                    </span>
                  )}
                </span>
                <span className="font-semibold whitespace-nowrap">{i.quantity} {i.unit}</span>
              </div>
            ))}
            {sold.length === 0 && <div className="px-3.5 py-3 text-sm text-gray-400">No line items yet.</div>}
          </div>

          {notSold.length > 0 && (
            <div className="mt-3 rounded-md border border-red-200 bg-red-50 px-3.5 py-2.5">
              <div className="text-[11px] font-bold uppercase tracking-[0.1em] text-red-700">
                {signed ? "Not sold — do NOT carry out" : "Optional extras — awaiting client choice"}
              </div>
              <ul className="mt-1 mb-0 pl-5 text-sm text-red-900">
                {notSold.map((i) => <li key={i.id}>{i.description} ({i.quantity} {i.unit})</li>)}
              </ul>
            </div>
          )}

          {s.exclusions?.trim() && (
            <>
              <Head>Exclusions — outside the quoted scope</Head>
              <div className="rounded-r-lg border-l-4 px-4 py-3" style={{ borderColor: accent, backgroundColor: `${accent}14` }}>
                <p className="text-sm whitespace-pre-wrap m-0">{s.exclusions}</p>
              </div>
            </>
          )}

          <Head>Site &amp; job information</Head>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
            {s.accessNotes?.trim() && <InfoRow label="Access" value={s.accessNotes} />}
            {s.waterSupply?.trim() && <InfoRow label="Water supply" value={s.waterSupply} />}
            {s.chemicalsRequired?.trim() && <InfoRow label="Chemicals required" value={s.chemicalsRequired} />}
            {s.measurements?.trim() && <InfoRow label="Measurements (surveyor notes)" value={s.measurements} />}
            {!!s.areaSqm && <InfoRow label="Measured area" value={`${Math.round(s.areaSqm).toLocaleString()} m²`} />}
            {!!s.linearMeters && <InfoRow label="Measured length" value={`${Math.round(s.linearMeters).toLocaleString()} m`} />}
          </div>

          {s.photos.length > 0 && (
            <>
              <Head>Site photos</Head>
              <div className="grid grid-cols-2 gap-3">
                {s.photos.map((p) => (
                  <figure key={p.id} className="m-0">
                    <ZoomableImage src={p.fileUrl} alt={p.caption || "Site photo"} caption={p.caption}
                      className="w-full aspect-[4/3] rounded-md border object-cover" />
                    <figcaption className="text-[11px] text-gray-500 mt-1 text-center">
                      {p.caption}{p.internalOnly ? (p.caption ? " · " : "") + "internal only" : ""}
                    </figcaption>
                  </figure>
                ))}
              </div>
            </>
          )}

          <div className="mt-8 rounded-b-lg px-5 py-3 text-[11px] flex flex-wrap items-center justify-between gap-2"
            style={{ backgroundColor: brand, color: onBrand }}>
            <span className="font-semibold">{org.name} — internal works order</span>
            <span style={{ opacity: 0.85 }}>{[org.phone, org.email].filter(Boolean).join(" · ")}</span>
          </div>
        </div>
        <p className="text-center text-xs text-gray-400 mt-6">Internal document — not for the client. Powered by SurvAIPro</p>
      </div>
    </main>
  )
}
