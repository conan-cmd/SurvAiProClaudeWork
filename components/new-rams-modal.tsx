"use client"

import { useEffect, useState } from "react"
import { useRouter } from "next/navigation"
import { toast } from "sonner"
import { Loader2, Plus, ShieldAlert, X } from "lucide-react"
import { AddressInput } from "@/components/address-input"

// Fallback only — replaced by the organisation's own services when set.
const GENERIC_SERVICES = [
  "Cleaning", "Roofing", "Landscaping", "Electrical", "Plumbing",
  "Painting & Decorating", "Flooring", "Windows & Doors", "General Building",
]

// "Just need RAMS" flow: creates the job (a survey record, which keeps
// Survey/Proposal/RAMS linked if a proposal is wanted later) from the minimum
// details, then AI-drafts the RAMS straight from it. No proposal involved.
export function NewRamsButton() {
  const router = useRouter()
  const [open, setOpen] = useState(false)
  const [saving, setSaving] = useState(false)
  const [services, setServices] = useState<string[]>(GENERIC_SERVICES)
  const [customService, setCustomService] = useState("")
  const [form, setForm] = useState({
    title: "",
    clientName: "",
    clientAddress: "",
    serviceType: "",
    isResidential: false,
    writtenDescription: "",
  })
  const set = (k: string, v: string | boolean) => setForm((p) => ({ ...p, [k]: v }))

  useEffect(() => {
    if (!open) return
    fetch("/api/organization")
      .then((r) => r.json())
      .then((org) => {
        try {
          const own = org?.mainServices ? JSON.parse(org.mainServices) : []
          if (Array.isArray(own) && own.length) setServices(own)
        } catch { /* keep generic fallback */ }
      })
      .catch(() => {})
  }, [open])

  const create = async () => {
    const serviceType =
      form.serviceType === "Other" && customService.trim() ? customService.trim() : form.serviceType
    if (!form.title.trim() || !form.clientName.trim() || !form.clientAddress.trim() || !serviceType) {
      toast.error("Fill in the job title, client, address and type of work")
      return
    }
    setSaving(true)
    try {
      const surveyRes = await fetch("/api/surveys", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title: form.title.trim(),
          clientName: form.clientName.trim(),
          clientAddress: form.clientAddress.trim(),
          serviceType,
          isResidential: form.isResidential,
          writtenDescription: form.writtenDescription.trim() || undefined,
        }),
      })
      const survey = await surveyRes.json()
      if (!surveyRes.ok) throw new Error(survey.error || "Couldn't create the job")

      toast.info("Drafting your RAMS — this takes a moment…")
      const ramsRes = await fetch(`/api/surveys/${survey.id}/rams`, { method: "POST" })
      const rams = await ramsRes.json()
      if (!ramsRes.ok) throw new Error(rams.error || "Couldn't draft the RAMS")
      router.push(`/rams/${rams.id}`)
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Couldn't create the RAMS")
      setSaving(false)
    }
  }

  const inputCls =
    "w-full px-3 py-2 border rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-brand-blue"

  return (
    <>
      <button onClick={() => setOpen(true)}
        className="inline-flex items-center gap-1.5 px-4 py-2 bg-brand-blue text-white rounded-lg text-sm font-semibold hover:bg-blue-700">
        <Plus className="w-4 h-4" /> New RAMS
      </button>

      {open && (
        <div className="fixed inset-0 z-50 bg-black/40 flex items-end sm:items-center justify-center p-4"
          onClick={() => !saving && setOpen(false)}>
          <div className="bg-white rounded-xl shadow-xl w-full max-w-md p-5 space-y-3 max-h-[85vh] overflow-y-auto"
            onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between">
              <h3 className="font-bold text-brand-navy flex items-center gap-2">
                <ShieldAlert className="w-5 h-5 text-amber-600" /> New RAMS
              </h3>
              <button onClick={() => setOpen(false)} disabled={saving} aria-label="Close"
                className="p-1 text-gray-400 hover:text-gray-600"><X className="w-4 h-4" /></button>
            </div>
            <p className="text-xs text-gray-500">
              Just the basics — AI drafts the full RAMS from these details. A proposal can always be
              added to the same job later.
            </p>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Job title *</label>
              <input className={inputCls} value={form.title} placeholder="e.g. Office block façade clean"
                onChange={(e) => set("title", e.target.value)} />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Client name *</label>
              <input className={inputCls} value={form.clientName} placeholder="Jane Smith / Acme Ltd"
                onChange={(e) => set("clientName", e.target.value)} />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Site address *</label>
              <AddressInput value={form.clientAddress} onChange={(v) => set("clientAddress", v)}
                placeholder="Start typing the address…" className={inputCls} />
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Type of work *</label>
                <select className={`${inputCls} bg-white`} value={form.serviceType}
                  onChange={(e) => set("serviceType", e.target.value)}>
                  <option value="">Select…</option>
                  {services.map((s) => <option key={s} value={s}>{s}</option>)}
                  <option value="Other">Other…</option>
                </select>
                {form.serviceType === "Other" && (
                  <input className={`${inputCls} mt-2`} value={customService} placeholder="Describe the work type"
                    onChange={(e) => setCustomService(e.target.value)} />
                )}
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Property</label>
                <div className="flex rounded-lg border overflow-hidden">
                  {([["Commercial", false], ["Residential", true]] as const).map(([label, val]) => (
                    <button key={label} type="button" onClick={() => set("isResidential", val)}
                      className={`flex-1 px-2 py-2 text-sm font-medium ${form.isResidential === val ? "bg-brand-blue text-white" : "bg-white text-gray-600 hover:bg-gray-50"}`}>
                      {label}
                    </button>
                  ))}
                </div>
              </div>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Describe the works (optional)</label>
              <textarea spellCheck rows={3} className={inputCls} value={form.writtenDescription}
                placeholder="Anything that helps the RAMS draft — surfaces, methods, access, equipment…"
                onChange={(e) => set("writtenDescription", e.target.value)} />
            </div>
            <div className="flex justify-end gap-2 pt-1">
              <button onClick={() => setOpen(false)} disabled={saving}
                className="px-4 py-2 border rounded-lg text-sm font-medium hover:bg-gray-50">Cancel</button>
              <button onClick={create} disabled={saving}
                className="inline-flex items-center gap-2 px-4 py-2 bg-brand-blue text-white rounded-lg text-sm font-semibold hover:bg-blue-700 disabled:opacity-50">
                {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <ShieldAlert className="w-4 h-4" />}
                {saving ? "Drafting…" : "Create RAMS"}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  )
}
