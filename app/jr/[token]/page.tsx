"use client"

import { useEffect, useRef, useState } from "react"
import { useParams } from "next/navigation"
import { toast } from "sonner"
import { Loader2, AlertTriangle, Printer } from "lucide-react"
import { JobReportDocument, ReportDocData } from "@/components/job-report-document"

export default function PublicJobReportPage() {
  const { token } = useParams<{ token: string }>()
  const [data, setData] = useState<ReportDocData | null>(null)
  const [notFound, setNotFound] = useState(false)
  const [pdfBusy, setPdfBusy] = useState(false)
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    fetch(`/api/jr/${token}`)
      .then((r) => { if (!r.ok) throw new Error(); return r.json() })
      .then(setData)
      .catch(() => setNotFound(true))
  }, [token])

  const downloadPdf = async () => {
    if (!ref.current || !data) return
    setPdfBusy(true)
    try {
      const { exportAndShare } = await import("@/lib/pdf")
      const base = `${data.site.clientName}-job-report`.replace(/[^a-z0-9]+/gi, "-").replace(/^-|-$/g, "")
      await exportAndShare(ref.current, `${base || "job-report"}.pdf`, "Job Report")
    } catch {
      toast.error("Couldn't create the PDF — try your browser's print/share.")
    } finally {
      setPdfBusy(false)
    }
  }

  if (notFound) {
    return (
      <div className="min-h-screen flex items-center justify-center p-6 text-center">
        <div>
          <AlertTriangle className="w-10 h-10 text-amber-500 mx-auto mb-3" />
          <p className="text-gray-600">This report link is no longer valid.</p>
        </div>
      </div>
    )
  }
  if (!data) {
    return <div className="min-h-screen flex items-center justify-center"><Loader2 className="w-8 h-8 animate-spin text-gray-400" /></div>
  }

  return (
    <main className="min-h-screen bg-gray-50 py-6 px-3 md:py-10">
      <div className="max-w-3xl mx-auto">
        <div className="no-print flex justify-end mb-3">
          <button onClick={downloadPdf} disabled={pdfBusy}
            className="inline-flex items-center gap-1.5 px-4 py-2 bg-brand-blue text-white rounded-lg text-sm font-semibold hover:bg-blue-700 disabled:opacity-50">
            {pdfBusy ? <Loader2 className="w-4 h-4 animate-spin" /> : <Printer className="w-4 h-4" />} Download PDF
          </button>
        </div>
        <div ref={ref} className="bg-white rounded-xl shadow-sm p-4 md:p-10 print-area">
          <JobReportDocument data={data} />
        </div>
        <p className="text-center text-xs text-gray-400 mt-6">Powered by SurvAIPro</p>
      </div>
    </main>
  )
}
