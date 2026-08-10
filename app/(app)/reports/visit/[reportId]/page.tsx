"use client"

import { useCallback, useEffect, useRef, useState } from "react"
import Link from "next/link"
import { useParams } from "next/navigation"
import { toast } from "sonner"
import { Loader2, Check, Printer, Send, Plus, Trash2, Eye, Pencil } from "lucide-react"
import { DictateButton } from "@/components/dictate-button"
import { JobReportDocument, ReportDocData, REPORT_FIELDS } from "@/components/job-report-document"
import { uploadJobReportPhotos } from "@/lib/report-photo-upload"

type Photo = { id: string; fileUrl: string; caption: string | null }
type Report = {
  id: string
  visitDate: string
  status: string
  fields: string | null
  technicianName: string | null
  signatureImage: string | null
  signedAt: string | null
  photos: Photo[]
  site: { clientName: string; clientCompany: string | null; address: string }
  organization: { name: string; logoUrl: string | null; brandColor: string; phone: string | null; email: string | null }
}

export default function JobReportEditor() {
  const { reportId } = useParams<{ reportId: string }>()
  const [report, setReport] = useState<Report | null>(null)
  const [fields, setFields] = useState<Record<string, string>>({})
  const [mode, setMode] = useState<"edit" | "preview">("edit")
  const [saveState, setSaveState] = useState<"idle" | "saving" | "saved">("idle")
  const [busy, setBusy] = useState(false)
  const [pdfBusy, setPdfBusy] = useState(false)
  const [uploading, setUploading] = useState(false)
  const timers = useRef<Record<string, ReturnType<typeof setTimeout>>>({})
  const fileInput = useRef<HTMLInputElement>(null)
  const pdfRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    fetch(`/api/job-reports/${reportId}`)
      .then((r) => { if (!r.ok) throw new Error(); return r.json() })
      .then((d: Report) => {
        setReport(d)
        try { setFields(d.fields ? JSON.parse(d.fields) : {}) } catch { setFields({}) }
      })
      .catch(() => toast.error("Failed to load report"))
  }, [reportId])

  const patch = useCallback((key: string, body: Record<string, unknown>) => {
    setSaveState("saving")
    if (timers.current[key]) clearTimeout(timers.current[key])
    timers.current[key] = setTimeout(async () => {
      const res = await fetch(`/api/job-reports/${reportId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      })
      setSaveState(res.ok ? "saved" : "idle")
      if (!res.ok) toast.error("Autosave failed")
    }, 700)
  }, [reportId])

  const setField = (key: string, value: string) => {
    const next = { ...fields, [key]: value }
    setFields(next)
    patch("fields", { fields: next })
  }
  const setMeta = (body: Record<string, unknown>) => {
    setReport((r) => (r ? { ...r, ...body } as Report : r))
    patch(Object.keys(body)[0], body)
  }

  const addPhotos = async (files: FileList | null) => {
    if (!files?.length) return
    setUploading(true)
    try {
      const created = await uploadJobReportPhotos(reportId, files)
      setReport((r) => (r ? { ...r, photos: [...r.photos, ...created.map((p) => ({ id: p.id, fileUrl: p.fileUrl, caption: p.caption }))] } : r))
      toast.success(`${created.length} photo${created.length > 1 ? "s" : ""} added`)
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Upload failed")
    } finally {
      setUploading(false)
      if (fileInput.current) fileInput.current.value = ""
    }
  }
  const removePhoto = async (id: string) => {
    const prev = report?.photos || []
    setReport((r) => (r ? { ...r, photos: r.photos.filter((p) => p.id !== id) } : r))
    const res = await fetch(`/api/job-reports/${reportId}/photos/${id}`, { method: "DELETE" })
    if (!res.ok) { setReport((r) => (r ? { ...r, photos: prev } : r)); toast.error("Couldn't remove photo") }
  }

  const downloadPdf = async () => {
    if (!pdfRef.current || !report) return
    setPdfBusy(true)
    try {
      const { exportAndShare } = await import("@/lib/pdf")
      const base = `${report.site.clientName}-job-report`.replace(/[^a-z0-9]+/gi, "-").replace(/^-|-$/g, "")
      await exportAndShare(pdfRef.current, `${base || "job-report"}.pdf`, "Job Report")
    } catch {
      toast.error("Couldn't create the PDF — try Preview then print.")
    } finally {
      setPdfBusy(false)
    }
  }

  const complete = async () => {
    if (!confirm("Complete this report and send it to the office?")) return
    setBusy(true)
    try {
      const res = await fetch(`/api/job-reports/${reportId}/complete`, { method: "POST" })
      const d = await res.json()
      if (!res.ok) throw new Error(d.error)
      setReport((r) => (r ? { ...r, status: "COMPLETED" } : r))
      toast.success("Report completed and sent to the office")
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Couldn't complete the report")
    } finally {
      setBusy(false)
    }
  }

  if (!report) return <div className="flex justify-center py-20"><Loader2 className="w-8 h-8 animate-spin text-brand-blue" /></div>

  const docData: ReportDocData = {
    organization: report.organization,
    site: report.site,
    visitDate: report.visitDate,
    fields,
    photos: report.photos,
    technicianName: report.technicianName,
    signatureImage: report.signatureImage,
    signedAt: report.signedAt,
  }
  const input = "w-full text-sm px-3 py-2 border rounded-lg focus:outline-none focus:ring-2 focus:ring-brand-blue"

  return (
    <div className="max-w-2xl mx-auto space-y-5">
      <div className="no-print flex flex-wrap items-center justify-between gap-2">
        <div className="min-w-0">
          <Link href={`/reports/${""}`} onClick={(e) => { e.preventDefault(); history.back() }} className="text-sm text-brand-blue hover:underline">← Back</Link>
          <h1 className="text-xl font-bold text-brand-navy truncate">{report.site.clientName} — visit report</h1>
          <span className="text-xs text-gray-400">
            {report.status === "COMPLETED" ? <span className="text-emerald-600 font-medium">Completed</span> : saveState === "saving" ? "Saving…" : saveState === "saved" ? <span className="inline-flex items-center gap-1 text-emerald-600"><Check className="w-3 h-3" /> Saved</span> : "Draft"}
          </span>
        </div>
        <div className="flex items-center gap-2">
          <button onClick={() => setMode(mode === "edit" ? "preview" : "edit")} className="inline-flex items-center gap-1.5 px-3 py-2 border rounded-lg text-sm font-medium bg-white hover:bg-gray-50">
            {mode === "edit" ? <Eye className="w-4 h-4" /> : <Pencil className="w-4 h-4" />} {mode === "edit" ? "Preview" : "Edit"}
          </button>
          <button onClick={downloadPdf} disabled={pdfBusy} className="inline-flex items-center gap-1.5 px-3 py-2 border rounded-lg text-sm font-medium bg-white hover:bg-gray-50 disabled:opacity-50">
            {pdfBusy ? <Loader2 className="w-4 h-4 animate-spin" /> : <Printer className="w-4 h-4" />} PDF
          </button>
          <button onClick={complete} disabled={busy} className="inline-flex items-center gap-1.5 px-3 py-2 bg-brand-blue text-white rounded-lg text-sm font-semibold hover:bg-blue-700 disabled:opacity-50">
            {busy ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />} Complete &amp; send
          </button>
        </div>
      </div>

      {mode === "preview" ? (
        <div className="bg-white rounded-xl shadow-sm p-4 md:p-10 print-area"><JobReportDocument data={docData} /></div>
      ) : (
        <div className="space-y-4 no-print">
          <section className="bg-white rounded-xl shadow-sm p-5 grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Visit date</label>
              <input type="date" className={input} value={report.visitDate.slice(0, 10)}
                onChange={(e) => setMeta({ visitDate: new Date(e.target.value).toISOString() })} />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Technician</label>
              <input className={input} value={report.technicianName || ""} placeholder="Your name"
                onChange={(e) => setMeta({ technicianName: e.target.value })} />
            </div>
          </section>

          <section className="bg-white rounded-xl shadow-sm p-5 space-y-4">
            {REPORT_FIELDS.map((f) => (
              <div key={f.key}>
                <div className="flex items-center justify-between mb-1">
                  <span className="text-sm font-medium text-gray-700">{f.label}</span>
                  <DictateButton onText={(t) => setField(f.key, ((fields[f.key] || "") + " " + t).trim())} />
                </div>
                <textarea rows={3} className={input} value={fields[f.key] || ""} placeholder={f.placeholder}
                  onChange={(e) => setField(f.key, e.target.value)} />
              </div>
            ))}
          </section>

          <section className="bg-white rounded-xl shadow-sm p-5">
            <h2 className="font-semibold text-brand-navy mb-3">Photos</h2>
            {report.photos.length > 0 && (
              <div className="grid grid-cols-3 sm:grid-cols-4 gap-2 mb-3">
                {report.photos.map((p) => (
                  <div key={p.id} className="relative">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={p.fileUrl} alt="" className="aspect-square object-cover w-full rounded-lg border" />
                    <button onClick={() => removePhoto(p.id)} aria-label="Remove"
                      className="absolute -top-1.5 -right-1.5 bg-white border rounded-full p-0.5 text-gray-500 hover:text-red-600 shadow">
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                ))}
              </div>
            )}
            <input ref={fileInput} type="file" accept="image/*" multiple className="hidden" onChange={(e) => addPhotos(e.target.files)} />
            <button type="button" onClick={() => fileInput.current?.click()} disabled={uploading}
              className="inline-flex items-center gap-1.5 text-sm font-semibold text-brand-blue hover:underline disabled:opacity-50">
              {uploading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Plus className="w-4 h-4" />} {uploading ? "Uploading…" : "Add photos"}
            </button>
          </section>

          <SignatureSection
            signatureImage={report.signatureImage}
            onSave={(dataUrl) => setMeta({ signatureImage: dataUrl })}
            onClear={() => setMeta({ signatureImage: null })}
          />
        </div>
      )}

      {/* Off-screen copy for the PDF */}
      <div ref={pdfRef} className="hidden"><JobReportDocument data={docData} /></div>
    </div>
  )
}

// Simple canvas signature — technician signs, saved as a data URL on the report.
function SignatureSection({
  signatureImage,
  onSave,
  onClear,
}: {
  signatureImage: string | null
  onSave: (dataUrl: string) => void
  onClear: () => void
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const drawing = useRef(false)
  const hasInk = useRef(false)

  const pos = (e: React.PointerEvent) => {
    const c = canvasRef.current!
    const rect = c.getBoundingClientRect()
    return { x: (e.clientX - rect.left) * (c.width / rect.width), y: (e.clientY - rect.top) * (c.height / rect.height) }
  }
  const start = (e: React.PointerEvent) => { drawing.current = true; hasInk.current = true; const ctx = canvasRef.current!.getContext("2d")!; const p = pos(e); ctx.beginPath(); ctx.moveTo(p.x, p.y) }
  const move = (e: React.PointerEvent) => { if (!drawing.current) return; const ctx = canvasRef.current!.getContext("2d")!; const p = pos(e); ctx.lineWidth = 2; ctx.lineCap = "round"; ctx.strokeStyle = "#0F172A"; ctx.lineTo(p.x, p.y); ctx.stroke() }
  const end = () => (drawing.current = false)
  const clear = () => { const c = canvasRef.current; if (c) c.getContext("2d")!.clearRect(0, 0, c.width, c.height); hasInk.current = false }

  if (signatureImage) {
    return (
      <section className="bg-white rounded-xl shadow-sm p-5">
        <h2 className="font-semibold text-brand-navy mb-2">Signature</h2>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={signatureImage} alt="Signature" className="h-16 border rounded bg-white" />
        <button onClick={onClear} className="block mt-2 text-sm text-gray-500 hover:underline">Clear &amp; re-sign</button>
      </section>
    )
  }

  return (
    <section className="bg-white rounded-xl shadow-sm p-5">
      <h2 className="font-semibold text-brand-navy mb-2">Signature</h2>
      <div className="border-2 border-dashed rounded-lg bg-gray-50 relative">
        <canvas ref={canvasRef} width={560} height={150} className="w-full touch-none cursor-crosshair"
          onPointerDown={start} onPointerMove={move} onPointerUp={end} onPointerLeave={end} />
        <span className="absolute bottom-1.5 left-3 text-[11px] text-gray-400 pointer-events-none">Sign here</span>
      </div>
      <div className="flex gap-3 mt-2">
        <button onClick={() => { if (!hasInk.current) { toast.error("Please sign first"); return } onSave(canvasRef.current!.toDataURL("image/png")) }}
          className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-brand-blue text-white rounded-lg text-sm font-semibold hover:bg-blue-700">Save signature</button>
        <button onClick={clear} className="text-sm text-gray-500 hover:underline">Clear</button>
      </div>
    </section>
  )
}
