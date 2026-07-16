"use client"

import { useState } from "react"
import { useRouter } from "next/navigation"
import { toast } from "sonner"
import { ArrowRight, ArrowLeft, Sparkles, Loader2 } from "lucide-react"

const TONES = [
  { value: "FRIENDLY", label: "Friendly", desc: "Warm and approachable" },
  { value: "PROFESSIONAL", label: "Professional", desc: "Clear and businesslike" },
  { value: "PREMIUM", label: "Premium", desc: "Polished and high-end" },
  { value: "TECHNICAL", label: "Technical", desc: "Detailed and precise" },
]

type Sections = {
  aboutUsSection: string
  whyChooseUsSection: string
  ourExperienceSection: string
  ourApproachSection: string
}

export default function OnboardingPage() {
  const router = useRouter()
  const [step, setStep] = useState(1)
  const [saving, setSaving] = useState(false)
  const [generating, setGenerating] = useState(false)

  const [form, setForm] = useState({
    website: "",
    brandColor: "#2563EB",
    secondaryColor: "#10B981",
    email: "",
    phone: "",
    mainServices: "",
    areasCovered: "",
    yearEstablished: "",
    mainUSP: "",
    reviewCount: "",
    whyChooseUs: "",
    proposalTone: "PROFESSIONAL",
  })

  const [sections, setSections] = useState<Sections>({
    aboutUsSection: "",
    whyChooseUsSection: "",
    ourExperienceSection: "",
    ourApproachSection: "",
  })

  const set = (name: string, value: string) =>
    setForm((prev) => ({ ...prev, [name]: value }))

  const saveDetails = async () => {
    setSaving(true)
    try {
      const res = await fetch("/api/organization", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          website: form.website || "",
          brandColor: form.brandColor,
          secondaryColor: form.secondaryColor,
          email: form.email || "",
          phone: form.phone,
          mainServices: form.mainServices.split(",").map((s) => s.trim()).filter(Boolean),
          areasCovered: form.areasCovered.split(",").map((s) => s.trim()).filter(Boolean),
          yearEstablished: form.yearEstablished ? parseInt(form.yearEstablished) : null,
          mainUSP: form.mainUSP,
          reviewCount: form.reviewCount ? parseInt(form.reviewCount) : null,
          whyChooseUs: form.whyChooseUs,
          proposalTone: form.proposalTone,
        }),
      })
      if (!res.ok) throw new Error((await res.json()).error)
      return true
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed to save")
      return false
    } finally {
      setSaving(false)
    }
  }

  const generateSections = async () => {
    setGenerating(true)
    try {
      const res = await fetch("/api/organization/generate-sections", { method: "POST" })
      if (!res.ok) throw new Error((await res.json()).error)
      const data = await res.json()
      setSections({
        aboutUsSection: data.aboutUsSection || "",
        whyChooseUsSection: data.whyChooseUsSection || "",
        ourExperienceSection: data.ourExperienceSection || "",
        ourApproachSection: data.ourApproachSection || "",
      })
      toast.success("Draft sections generated — please review and edit them")
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Generation failed")
    } finally {
      setGenerating(false)
    }
  }

  const handleNext = async () => {
    if (step === 2) {
      const ok = await saveDetails()
      if (!ok) return
      setStep(3)
      generateSections()
      return
    }
    setStep(step + 1)
  }

  const finish = async () => {
    setSaving(true)
    try {
      const res = await fetch("/api/organization", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(sections),
      })
      if (!res.ok) throw new Error((await res.json()).error)
      toast.success("Setup complete!")
      router.push("/dashboard")
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed to save")
    } finally {
      setSaving(false)
    }
  }

  const inputCls =
    "w-full px-4 py-2.5 border rounded-lg focus:outline-none focus:ring-2 focus:ring-brand-blue text-base"
  const labelCls = "block text-sm font-medium text-gray-700 mb-1"

  return (
    <div className="min-h-screen bg-brand-gray p-4 pb-24">
      <div className="max-w-2xl mx-auto pt-8">
        {/* Progress */}
        <div className="flex items-center gap-2 mb-8">
          {[1, 2, 3].map((s) => (
            <div
              key={s}
              className={`h-2 flex-1 rounded-full transition ${
                s <= step ? "bg-brand-blue" : "bg-gray-200"
              }`}
            />
          ))}
        </div>

        {step === 1 && (
          <div className="bg-white rounded-xl shadow-sm p-6 md:p-8 animate-fadeIn">
            <h1 className="text-2xl font-bold text-brand-navy mb-1">Company details</h1>
            <p className="text-gray-600 mb-6">Tell us about your business</p>

            <div className="space-y-4">
              <div>
                <label className={labelCls}>Website</label>
                <input type="url" placeholder="https://yourcompany.co.uk" className={inputCls}
                  value={form.website} onChange={(e) => set("website", e.target.value)} />
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className={labelCls}>Contact email</label>
                  <input type="email" placeholder="info@company.co.uk" className={inputCls}
                    value={form.email} onChange={(e) => set("email", e.target.value)} />
                </div>
                <div>
                  <label className={labelCls}>Contact phone</label>
                  <input type="tel" placeholder="020 1234 5678" className={inputCls}
                    value={form.phone} onChange={(e) => set("phone", e.target.value)} />
                </div>
              </div>
              <div>
                <label className={labelCls}>Main services (comma separated)</label>
                <input placeholder="Roof cleaning, Gutter clearance, Render cleaning" className={inputCls}
                  value={form.mainServices} onChange={(e) => set("mainServices", e.target.value)} />
              </div>
              <div>
                <label className={labelCls}>Areas covered (comma separated)</label>
                <input placeholder="London, Surrey, Kent" className={inputCls}
                  value={form.areasCovered} onChange={(e) => set("areasCovered", e.target.value)} />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className={labelCls}>Year established</label>
                  <input type="number" placeholder="2015" className={inputCls}
                    value={form.yearEstablished} onChange={(e) => set("yearEstablished", e.target.value)} />
                </div>
                <div>
                  <label className={labelCls}>5-star reviews</label>
                  <input type="number" placeholder="120" className={inputCls}
                    value={form.reviewCount} onChange={(e) => set("reviewCount", e.target.value)} />
                </div>
              </div>
            </div>
          </div>
        )}

        {step === 2 && (
          <div className="bg-white rounded-xl shadow-sm p-6 md:p-8 animate-fadeIn">
            <h1 className="text-2xl font-bold text-brand-navy mb-1">Brand & positioning</h1>
            <p className="text-gray-600 mb-6">This shapes how your proposals look and read</p>

            <div className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className={labelCls}>Primary brand colour</label>
                  <div className="flex items-center gap-3">
                    <input type="color" value={form.brandColor}
                      onChange={(e) => set("brandColor", e.target.value)}
                      className="h-11 w-14 rounded border cursor-pointer" />
                    <span className="text-sm text-gray-600">{form.brandColor}</span>
                  </div>
                </div>
                <div>
                  <label className={labelCls}>Secondary colour</label>
                  <div className="flex items-center gap-3">
                    <input type="color" value={form.secondaryColor}
                      onChange={(e) => set("secondaryColor", e.target.value)}
                      className="h-11 w-14 rounded border cursor-pointer" />
                    <span className="text-sm text-gray-600">{form.secondaryColor}</span>
                  </div>
                </div>
              </div>
              <div>
                <label className={labelCls}>Main USP</label>
                <input placeholder="e.g. The only SafeContractor-approved roof cleaners in Kent" className={inputCls}
                  value={form.mainUSP} onChange={(e) => set("mainUSP", e.target.value)} />
              </div>
              <div>
                <label className={labelCls}>Why do clients choose you?</label>
                <textarea rows={3} placeholder="Fast turnaround, tidy work, fully insured..." className={inputCls}
                  value={form.whyChooseUs} onChange={(e) => set("whyChooseUs", e.target.value)} />
              </div>
              <div>
                <label className={labelCls}>Proposal tone</label>
                <div className="grid grid-cols-2 gap-3">
                  {TONES.map((t) => (
                    <button key={t.value} type="button"
                      onClick={() => set("proposalTone", t.value)}
                      className={`p-3 rounded-lg border-2 text-left transition ${
                        form.proposalTone === t.value
                          ? "border-brand-blue bg-blue-50"
                          : "border-gray-200 hover:border-gray-300"
                      }`}>
                      <div className="font-semibold text-brand-navy">{t.label}</div>
                      <div className="text-xs text-gray-500">{t.desc}</div>
                    </button>
                  ))}
                </div>
              </div>
            </div>
          </div>
        )}

        {step === 3 && (
          <div className="bg-white rounded-xl shadow-sm p-6 md:p-8 animate-fadeIn">
            <h1 className="text-2xl font-bold text-brand-navy mb-1">Review your sections</h1>
            <p className="text-gray-600 mb-6">
              These AI drafts will be reused in your proposals. <strong>Edit them until they
              sound like you</strong> — nothing goes to a client without your review.
            </p>

            {generating ? (
              <div className="flex flex-col items-center py-12 text-gray-500">
                <Loader2 className="w-8 h-8 animate-spin mb-3 text-brand-blue" />
                <p>Writing your draft sections…</p>
              </div>
            ) : (
              <div className="space-y-5">
                {(
                  [
                    ["aboutUsSection", "About Us"],
                    ["whyChooseUsSection", "Why Choose Us"],
                    ["ourExperienceSection", "Our Experience"],
                    ["ourApproachSection", "Our Approach"],
                  ] as const
                ).map(([key, label]) => (
                  <div key={key}>
                    <label className={labelCls}>{label}</label>
                    <textarea rows={5} className={inputCls}
                      value={sections[key]}
                      onChange={(e) => setSections((p) => ({ ...p, [key]: e.target.value }))} />
                  </div>
                ))}
                <button type="button" onClick={generateSections}
                  className="inline-flex items-center gap-2 text-sm text-brand-blue font-medium hover:underline">
                  <Sparkles className="w-4 h-4" /> Regenerate drafts
                </button>
              </div>
            )}
          </div>
        )}

        {/* Nav buttons */}
        <div className="flex justify-between mt-6">
          {step > 1 ? (
            <button onClick={() => setStep(step - 1)}
              className="inline-flex items-center gap-2 px-5 py-2.5 rounded-lg border font-medium text-gray-700 hover:bg-gray-50">
              <ArrowLeft className="w-4 h-4" /> Back
            </button>
          ) : (
            <div />
          )}

          {step < 3 ? (
            <button onClick={handleNext} disabled={saving}
              className="inline-flex items-center gap-2 px-6 py-2.5 bg-brand-blue text-white rounded-lg font-semibold hover:bg-blue-700 disabled:opacity-50">
              {saving ? "Saving…" : "Continue"} <ArrowRight className="w-4 h-4" />
            </button>
          ) : (
            <button onClick={finish} disabled={saving || generating}
              className="inline-flex items-center gap-2 px-6 py-2.5 bg-brand-green text-white rounded-lg font-semibold hover:bg-emerald-600 disabled:opacity-50">
              {saving ? "Saving…" : "Finish setup"}
            </button>
          )}
        </div>
      </div>
    </div>
  )
}
