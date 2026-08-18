"use client"

import { useEffect, useRef, useState } from "react"
import { useRouter } from "next/navigation"
import { toast } from "sonner"
import { ArrowRight, Loader2, Search, X, Users } from "lucide-react"
import { DictateButton } from "@/components/dictate-button"
import { AddressInput } from "@/components/address-input"

// Fallback only - replaced by the organisation's own services when set
const GENERIC_SERVICES = [
  "Cleaning", "Roofing", "Landscaping", "Electrical", "Plumbing",
  "Painting & Decorating", "Flooring", "Windows & Doors", "General Building",
]

// Module scope (not inside the page) so it's a stable component type — otherwise
// re-renders remount the Dictate button and kill an in-progress recording when you
// tap another control (e.g. the residential/commercial toggle).
function FieldLabel({ label, onText }: { label: string; onText: (text: string) => void }) {
  return (
    <div className="flex items-center justify-between mb-1">
      <span className="text-sm font-medium text-gray-700">{label}</span>
      <DictateButton onText={onText} />
    </div>
  )
}

export default function NewSurveyPage() {
  const router = useRouter()
  const [saving, setSaving] = useState(false)
  const [services, setServices] = useState<string[]>(GENERIC_SERVICES)
  const [customService, setCustomService] = useState("")

  // Pipedrive "import a contact" state.
  type PdPerson = { id: number; name: string; email: string; phone: string; company: string }
  const [pipedriveOn, setPipedriveOn] = useState(false)
  const [importOpen, setImportOpen] = useState(false)
  const [query, setQuery] = useState("")
  const [results, setResults] = useState<PdPerson[]>([])
  const [searching, setSearching] = useState(false)
  const searchTimer = useRef<ReturnType<typeof setTimeout> | null>(null)

  useEffect(() => {
    fetch("/api/organization")
      .then((r) => r.json())
      .then((org) => {
        try {
          const own = org?.mainServices ? JSON.parse(org.mainServices) : []
          if (Array.isArray(own) && own.length) setServices(own)
        } catch {
          // keep generic fallback
        }
      })
      .catch(() => {})
    fetch("/api/organization/pipedrive")
      .then((r) => r.json())
      .then((d) => setPipedriveOn(!!d.connected))
      .catch(() => {})
  }, [])

  useEffect(() => {
    if (!importOpen) return
    if (searchTimer.current) clearTimeout(searchTimer.current)
    if (query.trim().length < 2) {
      setResults([])
      return
    }
    searchTimer.current = setTimeout(async () => {
      setSearching(true)
      try {
        const res = await fetch(`/api/pipedrive/persons?q=${encodeURIComponent(query)}`)
        const d = await res.json()
        setResults(res.ok && Array.isArray(d) ? d : [])
      } catch {
        setResults([])
      } finally {
        setSearching(false)
      }
    }, 350)
  }, [query, importOpen])
  const [form, setForm] = useState({
    clientName: "",
    clientCompany: "",
    clientEmail: "",
    clientPhone: "",
    clientAddress: "",
    title: "",
    serviceType: "",
    isResidential: true,
    surveyedInPerson: false,
    writtenDescription: "",
    clientPriorities: "",
    accessNotes: "",
    measurements: "",
    exclusions: "",
  })

  const set = (name: string, value: string | boolean) =>
    setForm((prev) => ({ ...prev, [name]: value }))

  const pickContact = (p: PdPerson) => {
    setForm((prev) => ({
      ...prev,
      clientName: p.name || prev.clientName,
      clientEmail: p.email || prev.clientEmail,
      clientPhone: p.phone || prev.clientPhone,
      clientCompany: p.company || prev.clientCompany,
    }))
    setImportOpen(false)
    setQuery("")
    setResults([])
    toast.success("Contact imported from Pipedrive")
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!form.clientName || !form.clientAddress || !form.title || !form.serviceType) {
      toast.error("Please fill in client name, address, title and service type")
      return
    }
    setSaving(true)
    try {
      const payload = {
        ...form,
        serviceType:
          form.serviceType === "Other" && customService.trim()
            ? customService.trim()
            : form.serviceType,
      }
      const res = await fetch("/api/surveys", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      })
      if (!res.ok) throw new Error((await res.json()).error || "Failed to create survey")
      const survey = await res.json()
      toast.success("Survey created — now add photos and a voice note")
      router.push(`/surveys/${survey.id}`)
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to create survey")
    } finally {
      setSaving(false)
    }
  }

  const inputCls =
    "w-full px-4 py-2.5 border rounded-lg focus:outline-none focus:ring-2 focus:ring-brand-blue text-base"
  const labelCls = "block text-sm font-medium text-gray-700 mb-1"

  // Appends dictated speech to a field's current value
  const dictateInto = (name: keyof typeof form) => (text: string) =>
    set(name, ((form[name] as string) + " " + text).trim())

  return (
    <div className="max-w-2xl mx-auto">
      <h1 className="text-2xl font-bold text-brand-navy mb-1">New site survey</h1>
      <p className="text-gray-500 text-sm mb-6">
        Capture the essentials now — you can add photos and a voice note on the next screen.
      </p>

      <form onSubmit={handleSubmit} className="space-y-6">
        <section className="bg-white rounded-xl shadow-sm p-5 space-y-4">
          <div className="flex items-center justify-between gap-2">
            <h2 className="font-semibold text-brand-navy">Client</h2>
            {pipedriveOn && (
              <button type="button" onClick={() => setImportOpen(true)}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 border rounded-lg text-sm font-medium text-brand-blue hover:bg-blue-50">
                <Users className="w-4 h-4" /> Import from Pipedrive
              </button>
            )}
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className={labelCls}>Client name *</label>
              <input className={inputCls} value={form.clientName}
                onChange={(e) => set("clientName", e.target.value)} placeholder="Jane Smith" />
            </div>
            <div>
              <label className={labelCls}>Company</label>
              <input className={inputCls} value={form.clientCompany}
                onChange={(e) => set("clientCompany", e.target.value)} placeholder="Optional" />
            </div>
            <div>
              <label className={labelCls}>Email</label>
              <input type="email" className={inputCls} value={form.clientEmail}
                onChange={(e) => set("clientEmail", e.target.value)} placeholder="jane@example.com" />
            </div>
            <div>
              <label className={labelCls}>Phone</label>
              <input type="tel" className={inputCls} value={form.clientPhone}
                onChange={(e) => set("clientPhone", e.target.value)} placeholder="07123 456789" />
            </div>
          </div>
          <div>
            <label className={labelCls}>Site address *</label>
            <AddressInput className={inputCls} value={form.clientAddress}
              onChange={(v) => set("clientAddress", v)}
              placeholder="Start typing the address…" />
          </div>
        </section>

        <section className="bg-white rounded-xl shadow-sm p-5 space-y-4">
          <h2 className="font-semibold text-brand-navy">Job</h2>
          <div>
            <label className={labelCls}>Proposal title *</label>
            <input className={inputCls} value={form.title}
              onChange={(e) => set("title", e.target.value)}
              placeholder="Roof clean and moss removal — 12 High Street" />
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className={labelCls}>Service type *</label>
              <select className={inputCls} value={form.serviceType}
                onChange={(e) => set("serviceType", e.target.value)}>
                <option value="">Select…</option>
                {services.map((s) => (
                  <option key={s} value={s}>{s}</option>
                ))}
                <option value="Other">Other…</option>
              </select>
              {form.serviceType === "Other" && (
                <input className={`${inputCls} mt-2`} placeholder="Describe the service"
                  value={customService} onChange={(e) => setCustomService(e.target.value)} />
              )}
            </div>
            <div>
              <label className={labelCls}>Property type</label>
              <div className="grid grid-cols-2 gap-2">
                {[["Residential", true], ["Commercial", false]].map(([label, val]) => (
                  <button key={String(label)} type="button"
                    onClick={() => set("isResidential", val as boolean)}
                    className={`py-2.5 rounded-lg border-2 font-medium text-sm transition ${
                      form.isResidential === val
                        ? "border-brand-blue bg-blue-50 text-brand-blue"
                        : "border-gray-200 text-gray-600"
                    }`}>
                    {label}
                  </button>
                ))}
              </div>
              <label className="mt-2 flex items-center gap-2 text-sm text-gray-600 cursor-pointer"
                title="Tag jobs surveyed in person — the dashboard compares their conversion against remote quotes">
                <input type="checkbox" checked={form.surveyedInPerson}
                  onChange={(e) => set("surveyedInPerson", e.target.checked)}
                  className="rounded accent-blue-600" />
                Site survey carried out in person
              </label>
            </div>
          </div>
          <div>
            <FieldLabel label="Written survey description" onText={dictateInto("writtenDescription")} />
            <textarea spellCheck rows={4} className={inputCls} value={form.writtenDescription}
              onChange={(e) => set("writtenDescription", e.target.value)}
              placeholder="What you found on site, condition, recommended works…" />
          </div>
          <div>
            <FieldLabel label="Client priorities" onText={dictateInto("clientPriorities")} />
            <textarea spellCheck rows={2} className={inputCls} value={form.clientPriorities}
              onChange={(e) => set("clientPriorities", e.target.value)}
              placeholder="e.g. Minimal disruption, done before end of month" />
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <FieldLabel label="Access notes" onText={dictateInto("accessNotes")} />
              <textarea spellCheck rows={2} className={inputCls} value={form.accessNotes}
                onChange={(e) => set("accessNotes", e.target.value)}
                placeholder="Parking, keys, restrictions…" />
            </div>
            <div>
              <FieldLabel label="Measurements" onText={dictateInto("measurements")} />
              <textarea spellCheck rows={2} className={inputCls} value={form.measurements}
                onChange={(e) => set("measurements", e.target.value)}
                placeholder="e.g. Roof approx 85m², gutters 24m" />
            </div>
          </div>
          <div>
            <FieldLabel label="Exclusions" onText={dictateInto("exclusions")} />
            <textarea spellCheck rows={2} className={inputCls} value={form.exclusions}
              onChange={(e) => set("exclusions", e.target.value)}
              placeholder="Anything not included in the job" />
          </div>
        </section>

        <button type="submit" disabled={saving}
          className="w-full sm:w-auto inline-flex items-center justify-center gap-2 px-6 py-3 bg-brand-blue text-white rounded-lg font-semibold hover:bg-blue-700 transition disabled:opacity-50">
          {saving ? "Creating…" : "Create survey"} <ArrowRight className="w-4 h-4" />
        </button>
      </form>

      {importOpen && (
        <div className="fixed inset-0 z-50 bg-black/40 flex items-end sm:items-center justify-center p-4"
          onClick={() => setImportOpen(false)}>
          <div className="bg-white rounded-xl shadow-xl w-full max-w-md p-5 space-y-3"
            onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between">
              <h3 className="font-bold text-brand-navy">Import a Pipedrive contact</h3>
              <button type="button" onClick={() => setImportOpen(false)} aria-label="Close"
                className="p-1 text-gray-400 hover:text-gray-600"><X className="w-4 h-4" /></button>
            </div>
            <div className="relative">
              <Search className="w-4 h-4 text-gray-400 absolute left-3 top-1/2 -translate-y-1/2" />
              <input autoFocus value={query} onChange={(e) => setQuery(e.target.value)}
                placeholder="Search by name or email…"
                className="w-full pl-9 pr-3 py-2 border rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-brand-blue" />
            </div>
            <div className="max-h-72 overflow-y-auto -mx-1">
              {searching ? (
                <div className="flex items-center gap-2 text-sm text-gray-400 p-3"><Loader2 className="w-4 h-4 animate-spin" /> Searching…</div>
              ) : query.trim().length < 2 ? (
                <p className="text-sm text-gray-400 p-3">Type at least 2 characters to search your Pipedrive contacts.</p>
              ) : results.length === 0 ? (
                <p className="text-sm text-gray-400 p-3">No contacts found.</p>
              ) : (
                results.map((p) => (
                  <button key={p.id} type="button" onClick={() => pickContact(p)}
                    className="w-full text-left px-3 py-2 rounded-lg hover:bg-blue-50">
                    <div className="font-medium text-gray-900 text-sm">{p.name || "Unnamed"}</div>
                    <div className="text-xs text-gray-500">{[p.company, p.email, p.phone].filter(Boolean).join(" · ") || "—"}</div>
                  </button>
                ))
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
