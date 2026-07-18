"use client"

import { useState } from "react"
import { useRouter } from "next/navigation"
import { toast } from "sonner"
import { ArrowRight } from "lucide-react"
import { DictateButton } from "@/components/dictate-button"
import { AddressInput } from "@/components/address-input"

const SERVICE_TYPES = [
  "Cleaning", "Roofing", "Landscaping", "Electrical", "Plumbing",
  "Painting & Decorating", "Flooring", "Windows & Doors", "General Building", "Other",
]

export default function NewSurveyPage() {
  const router = useRouter()
  const [saving, setSaving] = useState(false)
  const [form, setForm] = useState({
    clientName: "",
    clientCompany: "",
    clientEmail: "",
    clientPhone: "",
    clientAddress: "",
    title: "",
    serviceType: "",
    isResidential: true,
    writtenDescription: "",
    clientPriorities: "",
    accessNotes: "",
    measurements: "",
    exclusions: "",
  })

  const set = (name: string, value: string | boolean) =>
    setForm((prev) => ({ ...prev, [name]: value }))

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!form.clientName || !form.clientAddress || !form.title || !form.serviceType) {
      toast.error("Please fill in client name, address, title and service type")
      return
    }
    setSaving(true)
    try {
      const res = await fetch("/api/surveys", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(form),
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

  const FieldLabel = ({ label, field }: { label: string; field: keyof typeof form }) => (
    <div className="flex items-center justify-between mb-1">
      <span className="text-sm font-medium text-gray-700">{label}</span>
      <DictateButton onText={dictateInto(field)} />
    </div>
  )

  return (
    <div className="max-w-2xl mx-auto">
      <h1 className="text-2xl font-bold text-brand-navy mb-1">New site survey</h1>
      <p className="text-gray-500 text-sm mb-6">
        Capture the essentials now — you can add photos and a voice note on the next screen.
      </p>

      <form onSubmit={handleSubmit} className="space-y-6">
        <section className="bg-white rounded-xl shadow-sm p-5 space-y-4">
          <h2 className="font-semibold text-brand-navy">Client</h2>
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
                {SERVICE_TYPES.map((s) => (
                  <option key={s} value={s}>{s}</option>
                ))}
              </select>
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
            </div>
          </div>
          <div>
            <FieldLabel label="Written survey description" field="writtenDescription" />
            <textarea rows={4} className={inputCls} value={form.writtenDescription}
              onChange={(e) => set("writtenDescription", e.target.value)}
              placeholder="What you found on site, condition, recommended works…" />
          </div>
          <div>
            <FieldLabel label="Client priorities" field="clientPriorities" />
            <textarea rows={2} className={inputCls} value={form.clientPriorities}
              onChange={(e) => set("clientPriorities", e.target.value)}
              placeholder="e.g. Minimal disruption, done before end of month" />
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <FieldLabel label="Access notes" field="accessNotes" />
              <textarea rows={2} className={inputCls} value={form.accessNotes}
                onChange={(e) => set("accessNotes", e.target.value)}
                placeholder="Parking, keys, restrictions…" />
            </div>
            <div>
              <FieldLabel label="Measurements" field="measurements" />
              <textarea rows={2} className={inputCls} value={form.measurements}
                onChange={(e) => set("measurements", e.target.value)}
                placeholder="e.g. Roof approx 85m², gutters 24m" />
            </div>
          </div>
          <div>
            <FieldLabel label="Exclusions" field="exclusions" />
            <textarea rows={2} className={inputCls} value={form.exclusions}
              onChange={(e) => set("exclusions", e.target.value)}
              placeholder="Anything not included in the job" />
          </div>
        </section>

        <button type="submit" disabled={saving}
          className="w-full sm:w-auto inline-flex items-center justify-center gap-2 px-6 py-3 bg-brand-blue text-white rounded-lg font-semibold hover:bg-blue-700 transition disabled:opacity-50">
          {saving ? "Creating…" : "Create survey"} <ArrowRight className="w-4 h-4" />
        </button>
      </form>
    </div>
  )
}
