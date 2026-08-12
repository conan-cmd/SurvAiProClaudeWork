"use client"

import { useEffect, useState } from "react"
import Link from "next/link"
import { useParams, useRouter } from "next/navigation"
import { toast } from "sonner"
import { Loader2, Plus, ClipboardList, Check, Clock } from "lucide-react"

type Report = { id: string; visitDate: string; status: string; completedAt: string | null; createdAt: string }
type Site = {
  id: string
  clientName: string
  clientCompany: string | null
  address: string
  clientEmail: string | null
  clientPhone: string | null
  reports: Report[]
}

const fmt = (s: string) => new Date(s).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" })

export default function SitePage() {
  const { siteId } = useParams<{ siteId: string }>()
  const router = useRouter()
  const [site, setSite] = useState<Site | null>(null)
  const [creating, setCreating] = useState(false)

  useEffect(() => {
    fetch(`/api/job-sites/${siteId}`)
      .then((r) => { if (!r.ok) throw new Error(); return r.json() })
      .then(setSite)
      .catch(() => toast.error("Failed to load site"))
  }, [siteId])

  const newReport = async () => {
    setCreating(true)
    try {
      const res = await fetch("/api/job-reports", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ siteId }),
      })
      const d = await res.json()
      if (!res.ok) throw new Error(d.error)
      router.push(`/reports/visit/${d.id}`)
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Couldn't create the report")
      setCreating(false)
    }
  }

  if (!site) return <div className="flex justify-center py-20"><Loader2 className="w-8 h-8 animate-spin text-brand-blue" /></div>

  return (
    <div className="max-w-3xl mx-auto space-y-5">
      <Link href="/reports" className="text-sm text-brand-blue hover:underline">← All sites</Link>

      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <h1 className="text-2xl font-bold text-brand-navy truncate">{site.clientName}{site.clientCompany ? ` · ${site.clientCompany}` : ""}</h1>
          <p className="text-sm text-gray-500">{site.address}</p>
          {(site.clientEmail || site.clientPhone) && (
            <p className="text-xs text-gray-400 mt-0.5">{[site.clientEmail, site.clientPhone].filter(Boolean).join(" · ")}</p>
          )}
        </div>
        <button onClick={newReport} disabled={creating}
          className="shrink-0 inline-flex items-center gap-1.5 px-4 py-2 bg-brand-blue text-white rounded-lg text-sm font-semibold hover:bg-blue-700 disabled:opacity-50">
          {creating ? <Loader2 className="w-4 h-4 animate-spin" /> : <Plus className="w-4 h-4" />} New visit report
        </button>
      </div>

      {site.reports.length === 0 ? (
        <div className="bg-white rounded-xl shadow-sm p-10 text-center text-gray-400">No visit reports yet.</div>
      ) : (
        <div className="bg-white rounded-xl shadow-sm divide-y">
          {site.reports.map((r) => (
            <Link key={r.id} href={`/reports/visit/${r.id}`} className="flex items-center justify-between gap-3 p-4 hover:bg-gray-50">
              <div className="flex items-center gap-2 min-w-0">
                <ClipboardList className="w-4 h-4 text-gray-400 shrink-0" />
                <span className="font-medium text-gray-900">Visit {fmt(r.visitDate)}</span>
              </div>
              {r.status === "COMPLETED" ? (
                <span className="shrink-0 inline-flex items-center gap-1 text-xs font-semibold px-2.5 py-1 rounded-full bg-emerald-50 text-emerald-700"><Check className="w-3.5 h-3.5" /> Completed</span>
              ) : (
                <span className="shrink-0 inline-flex items-center gap-1 text-xs font-semibold px-2.5 py-1 rounded-full bg-gray-100 text-gray-500"><Clock className="w-3.5 h-3.5" /> Draft</span>
              )}
            </Link>
          ))}
        </div>
      )}
    </div>
  )
}
