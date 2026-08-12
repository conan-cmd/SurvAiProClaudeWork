"use client"

import { useEffect, useState } from "react"
import Link from "next/link"
import { useRouter } from "next/navigation"
import { toast } from "sonner"
import { Loader2, Plus, MapPin, ClipboardList, X, Search as SearchIcon } from "lucide-react"

type Site = {
  id: string
  clientName: string
  clientCompany: string | null
  address: string
  _count: { reports: number }
  createdBy?: { name: string | null; email: string } | null
}

export default function ReportsPage() {
  const router = useRouter()
  const [sites, setSites] = useState<Site[] | null>(null)
  const [query, setQuery] = useState("")
  const [open, setOpen] = useState(false)
  const [saving, setSaving] = useState(false)
  const [form, setForm] = useState({ clientName: "", clientCompany: "", clientEmail: "", clientPhone: "", address: "" })

  const load = () => fetch("/api/job-sites").then((r) => r.json()).then((d) => setSites(Array.isArray(d) ? d : [])).catch(() => setSites([]))
  useEffect(() => { load() }, [])

  const set = (k: string, v: string) => setForm((p) => ({ ...p, [k]: v }))

  const create = async () => {
    if (!form.clientName.trim() || !form.address.trim()) {
      toast.error("Client name and site address are required")
      return
    }
    setSaving(true)
    try {
      const res = await fetch("/api/job-sites", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(form),
      })
      const d = await res.json()
      if (!res.ok) throw new Error(d.error)
      router.push(`/reports/${d.id}`)
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Couldn't create the site")
      setSaving(false)
    }
  }

  return (
    <div className="max-w-3xl mx-auto space-y-5">
      <div className="flex items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-brand-navy">Job reports</h1>
          <p className="text-sm text-gray-500">Sites you visit — open one to log a new visit report.</p>
        </div>
        <button onClick={() => setOpen(true)}
          className="inline-flex items-center gap-1.5 px-4 py-2 bg-brand-blue text-white rounded-lg text-sm font-semibold hover:bg-blue-700">
          <Plus className="w-4 h-4" /> New site
        </button>
      </div>

      <div className="relative">
        <SearchIcon className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400 pointer-events-none" />
        <input type="search" value={query} onChange={(e) => setQuery(e.target.value)}
          placeholder="Search by client, company or address…" aria-label="Search sites"
          className="w-full pl-9 pr-3 py-2.5 border rounded-lg text-sm bg-white focus:outline-none focus:ring-2 focus:ring-brand-blue" />
      </div>

      {sites === null ? (
        <div className="flex justify-center py-20"><Loader2 className="w-8 h-8 animate-spin text-brand-blue" /></div>
      ) : sites.length === 0 ? (
        <div className="bg-white rounded-xl shadow-sm p-10 text-center text-gray-400">
          No sites yet. Add a site to start logging visit reports.
        </div>
      ) : (() => {
        const q = query.trim().toLowerCase()
        const shown = q
          ? sites.filter((s) =>
              [s.clientName, s.clientCompany, s.address].some((v) => v?.toLowerCase().includes(q))
            )
          : sites
        return shown.length === 0 ? (
          <div className="bg-white rounded-xl shadow-sm p-10 text-center text-gray-400">
            No sites match &ldquo;{query.trim()}&rdquo;.
          </div>
        ) : (
        <div className="bg-white rounded-xl shadow-sm divide-y">
          {shown.map((s) => (
            <Link key={s.id} href={`/reports/${s.id}`} className="flex items-center justify-between gap-3 p-4 hover:bg-gray-50">
              <div className="min-w-0">
                <div className="font-medium text-gray-900 truncate">{s.clientName}{s.clientCompany ? ` · ${s.clientCompany}` : ""}</div>
                <div className="text-sm text-gray-500 truncate flex items-center gap-1"><MapPin className="w-3.5 h-3.5 shrink-0" /> {s.address}</div>
              </div>
              <span className="shrink-0 inline-flex items-center gap-1 text-xs font-semibold px-2.5 py-1 rounded-full bg-blue-50 text-brand-blue">
                <ClipboardList className="w-3.5 h-3.5" /> {s._count.reports} report{s._count.reports === 1 ? "" : "s"}
              </span>
            </Link>
          ))}
        </div>
        )
      })()}

      {open && (
        <div className="fixed inset-0 z-50 bg-black/40 flex items-end sm:items-center justify-center p-4" onClick={() => !saving && setOpen(false)}>
          <div className="bg-white rounded-xl shadow-xl w-full max-w-md p-5 space-y-3" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between">
              <h3 className="font-bold text-brand-navy">New site</h3>
              <button onClick={() => setOpen(false)} disabled={saving} aria-label="Close" className="p-1 text-gray-400 hover:text-gray-600"><X className="w-4 h-4" /></button>
            </div>
            {[
              { k: "clientName", label: "Client name *", ph: "Jane Smith" },
              { k: "clientCompany", label: "Company", ph: "Optional" },
              { k: "address", label: "Site address *", ph: "12 High Street…" },
              { k: "clientEmail", label: "Client email", ph: "Optional" },
              { k: "clientPhone", label: "Client phone", ph: "Optional" },
            ].map((f) => (
              <div key={f.k}>
                <label className="block text-sm font-medium text-gray-700 mb-1">{f.label}</label>
                <input value={form[f.k as keyof typeof form]} onChange={(e) => set(f.k, e.target.value)} placeholder={f.ph}
                  className="w-full px-3 py-2 border rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-brand-blue" />
              </div>
            ))}
            <div className="flex justify-end gap-2 pt-1">
              <button onClick={() => setOpen(false)} disabled={saving} className="px-4 py-2 border rounded-lg text-sm font-medium hover:bg-gray-50">Cancel</button>
              <button onClick={create} disabled={saving}
                className="inline-flex items-center gap-2 px-4 py-2 bg-brand-blue text-white rounded-lg text-sm font-semibold hover:bg-blue-700 disabled:opacity-50">
                {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Plus className="w-4 h-4" />} Create site
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
