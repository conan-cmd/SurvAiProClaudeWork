"use client"

import { useEffect, useRef, useState } from "react"
import { toast } from "sonner"
import { Loader2, Upload, Sparkles } from "lucide-react"

type Org = {
  name: string
  website: string | null
  logoUrl: string | null
  brandColor: string
  secondaryColor: string
  email: string | null
  phone: string | null
  mainServices: string | null
  areasCovered: string | null
  yearEstablished: number | null
  mainUSP: string | null
  reviewCount: number | null
  whyChooseUs: string | null
  proposalTone: string
  aboutUsSection: string | null
  whyChooseUsSection: string | null
  ourExperienceSection: string | null
  ourApproachSection: string | null
  termsAndConditions: string | null
  youtubeChannelUrl: string | null
  depositRules: string | null
  signOffName: string | null
  headshotUrl: string | null
  signatureImageUrl: string | null
}

type DepositRule = { type: "NONE" | "PERCENT" | "FIXED"; value: number }
const parseRules = (s: string | null): { residential: DepositRule; commercial: DepositRule } => {
  try {
    const r = JSON.parse(s || "{}")
    return {
      residential: r.residential || { type: "NONE", value: 0 },
      commercial: r.commercial || { type: "NONE", value: 0 },
    }
  } catch {
    return { residential: { type: "NONE", value: 0 }, commercial: { type: "NONE", value: 0 } }
  }
}

export default function SettingsPage() {
  const [org, setOrg] = useState<Org | null>(null)
  const [saving, setSaving] = useState(false)
  const [generating, setGenerating] = useState(false)
  const logoInput = useRef<HTMLInputElement>(null)

  useEffect(() => {
    fetch("/api/organization")
      .then((r) => r.json())
      .then(setOrg)
      .catch(() => toast.error("Failed to load settings"))
  }, [])

  const set = (field: keyof Org, value: string | number | null) =>
    setOrg((prev) => (prev ? { ...prev, [field]: value } : prev))

  const save = async () => {
    if (!org) return
    setSaving(true)
    try {
      const res = await fetch("/api/organization", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: org.name,
          website: org.website || "",
          brandColor: org.brandColor,
          secondaryColor: org.secondaryColor,
          email: org.email || "",
          phone: org.phone || "",
          mainServices: (org.mainServices ? tryParse(org.mainServices) : []),
          areasCovered: (org.areasCovered ? tryParse(org.areasCovered) : []),
          yearEstablished: org.yearEstablished,
          mainUSP: org.mainUSP || "",
          reviewCount: org.reviewCount,
          whyChooseUs: org.whyChooseUs || "",
          proposalTone: org.proposalTone,
          aboutUsSection: org.aboutUsSection || "",
          whyChooseUsSection: org.whyChooseUsSection || "",
          ourExperienceSection: org.ourExperienceSection || "",
          ourApproachSection: org.ourApproachSection || "",
          termsAndConditions: org.termsAndConditions || "",
          youtubeChannelUrl: org.youtubeChannelUrl || "",
          depositRules: org.depositRules || "",
          signOffName: org.signOffName || "",
        }),
      })
      if (!res.ok) throw new Error((await res.json()).error)
      toast.success("Settings saved")
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to save")
    } finally {
      setSaving(false)
    }
  }

  const uploadImage = async (file: File | undefined, kind: "logo" | "headshot" | "signature") => {
    if (!file) return
    const formData = new FormData()
    formData.append("file", file)
    formData.append("kind", kind)
    const res = await fetch("/api/organization/logo", { method: "POST", body: formData })
    if (!res.ok) {
      toast.error((await res.json()).error || "Upload failed")
      return
    }
    const { url } = await res.json()
    const field = kind === "logo" ? "logoUrl" : kind === "headshot" ? "headshotUrl" : "signatureImageUrl"
    set(field, url)
    toast.success("Image updated")
  }
  const uploadLogo = (file: File | undefined) => uploadImage(file, "logo")

  const [generatingTerms, setGeneratingTerms] = useState(false)
  const generateTerms = async () => {
    setGeneratingTerms(true)
    try {
      const res = await fetch("/api/organization/generate-terms", { method: "POST" })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error)
      set("termsAndConditions", data.terms)
      toast.success("Draft terms added — review and edit, then Save")
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to draft terms")
    } finally {
      setGeneratingTerms(false)
    }
  }

  const regenerateSections = async () => {
    setGenerating(true)
    try {
      const res = await fetch("/api/organization/generate-sections", { method: "POST" })
      if (!res.ok) throw new Error((await res.json()).error)
      const data = await res.json()
      setOrg((prev) => (prev ? { ...prev, ...data } : prev))
      toast.success("Sections regenerated — review before use")
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Generation failed")
    } finally {
      setGenerating(false)
    }
  }

  if (!org) {
    return (
      <div className="flex justify-center py-20">
        <Loader2 className="w-8 h-8 animate-spin text-brand-blue" />
      </div>
    )
  }

  const inputCls =
    "w-full px-4 py-2.5 border rounded-lg focus:outline-none focus:ring-2 focus:ring-brand-blue text-base"
  const labelCls = "block text-sm font-medium text-gray-700 mb-1"

  return (
    <div className="max-w-2xl mx-auto space-y-6">
      <h1 className="text-2xl font-bold text-brand-navy">Settings</h1>

      <section className="bg-white rounded-xl shadow-sm p-5 space-y-4">
        <h2 className="font-semibold text-brand-navy">Company & branding</h2>
        <div className="flex items-center gap-4">
          {org.logoUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={org.logoUrl} alt="Logo" className="h-14 w-14 object-contain border rounded-lg p-1" />
          ) : (
            <div className="h-14 w-14 border-2 border-dashed rounded-lg flex items-center justify-center text-gray-300 text-xs">
              Logo
            </div>
          )}
          <input ref={logoInput} type="file" accept="image/*" className="hidden"
            onChange={(e) => uploadLogo(e.target.files?.[0])} />
          <button onClick={() => logoInput.current?.click()}
            className="inline-flex items-center gap-2 px-4 py-2 border rounded-lg text-sm font-medium hover:bg-gray-50">
            <Upload className="w-4 h-4" /> Upload logo
          </button>
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div>
            <label className={labelCls}>Company name</label>
            <input className={inputCls} value={org.name} onChange={(e) => set("name", e.target.value)} />
          </div>
          <div>
            <label className={labelCls}>Website</label>
            <input className={inputCls} value={org.website || ""} onChange={(e) => set("website", e.target.value)} />
          </div>
          <div>
            <label className={labelCls}>Contact email</label>
            <input className={inputCls} value={org.email || ""} onChange={(e) => set("email", e.target.value)} />
          </div>
          <div>
            <label className={labelCls}>Contact phone</label>
            <input className={inputCls} value={org.phone || ""} onChange={(e) => set("phone", e.target.value)} />
          </div>
          <div className="sm:col-span-2">
            <label className={labelCls}>YouTube channel URL</label>
            <input className={inputCls} placeholder="https://www.youtube.com/@YourChannel"
              value={org.youtubeChannelUrl || ""} onChange={(e) => set("youtubeChannelUrl", e.target.value)} />
            <p className="text-xs text-gray-400 mt-1">
              Lets you embed videos of similar jobs in your proposals.
            </p>
          </div>
          <div>
            <label className={labelCls}>Primary colour</label>
            <input type="color" value={org.brandColor} onChange={(e) => set("brandColor", e.target.value)}
              className="h-11 w-14 rounded border cursor-pointer" />
          </div>
          <div>
            <label className={labelCls}>Secondary colour</label>
            <input type="color" value={org.secondaryColor} onChange={(e) => set("secondaryColor", e.target.value)}
              className="h-11 w-14 rounded border cursor-pointer" />
          </div>
          <div>
            <label className={labelCls}>Proposal tone</label>
            <select className={inputCls} value={org.proposalTone}
              onChange={(e) => set("proposalTone", e.target.value)}>
              {["FRIENDLY", "PROFESSIONAL", "PREMIUM", "TECHNICAL"].map((t) => (
                <option key={t} value={t}>{t.charAt(0) + t.slice(1).toLowerCase()}</option>
              ))}
            </select>
          </div>
        </div>
      </section>

      <section className="bg-white rounded-xl shadow-sm p-5 space-y-4">
        <div className="flex items-center justify-between">
          <h2 className="font-semibold text-brand-navy">Reusable proposal sections</h2>
          <button onClick={regenerateSections} disabled={generating}
            className="inline-flex items-center gap-1.5 text-sm text-brand-blue font-medium hover:underline disabled:opacity-50">
            {generating ? <Loader2 className="w-4 h-4 animate-spin" /> : <Sparkles className="w-4 h-4" />}
            Regenerate with AI
          </button>
        </div>
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
            <textarea rows={4} className={inputCls} value={org[key] || ""}
              onChange={(e) => set(key, e.target.value)} />
          </div>
        ))}
      </section>

      <section className="bg-white rounded-xl shadow-sm p-5 space-y-4">
        <h2 className="font-semibold text-brand-navy">Personal sign-off</h2>
        <p className="text-sm text-gray-500">
          Shown at the bottom of every proposal — your name, photo and signature.
        </p>
        <div>
          <label className={labelCls}>Your name (as signed)</label>
          <input className={inputCls} placeholder="e.g. Conan Sammon, Managing Director"
            value={org.signOffName || ""} onChange={(e) => set("signOffName", e.target.value)} />
        </div>
        <div className="grid grid-cols-2 gap-4">
          {([["headshot", "Headshot", org.headshotUrl], ["signature", "Signature image", org.signatureImageUrl]] as const).map(
            ([kind, label, url]) => (
              <div key={kind}>
                <label className={labelCls}>{label}</label>
                {url ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={url} alt={label}
                    className={kind === "headshot" ? "w-16 h-16 rounded-full object-cover border mb-2" : "h-12 object-contain border rounded p-1 mb-2 bg-white"} />
                ) : (
                  <div className="h-16 border-2 border-dashed rounded-lg flex items-center justify-center text-gray-300 text-xs mb-2">
                    None yet
                  </div>
                )}
                <label className="inline-flex items-center gap-2 px-3 py-1.5 border rounded-lg text-xs font-medium hover:bg-gray-50 cursor-pointer">
                  <Upload className="w-3.5 h-3.5" /> Upload
                  <input type="file" accept="image/*" className="hidden"
                    onChange={(e) => uploadImage(e.target.files?.[0], kind)} />
                </label>
              </div>
            )
          )}
        </div>
        <p className="text-xs text-gray-400">
          Tip: sign white paper with a dark pen, photograph it straight-on, and upload — a
          PNG with a white background works perfectly.
        </p>
      </section>

      <section className="bg-white rounded-xl shadow-sm p-5 space-y-3">
        <h2 className="font-semibold text-brand-navy">Deposits</h2>
        <p className="text-sm text-gray-500">
          When a client signs a proposal, ask for a deposit before the job is confirmed.
        </p>
        {(["residential", "commercial"] as const).map((kind) => {
          const rules = parseRules(org.depositRules)
          const rule = rules[kind]
          const update = (patch: Partial<DepositRule>) => {
            const next = { ...rules, [kind]: { ...rule, ...patch } }
            set("depositRules", JSON.stringify(next))
          }
          return (
            <div key={kind} className="flex items-center gap-3">
              <span className="w-28 text-sm font-medium text-gray-700 capitalize">{kind}</span>
              <select className="px-3 py-2 border rounded-lg text-sm" value={rule.type}
                onChange={(e) => update({ type: e.target.value as DepositRule["type"] })}>
                <option value="NONE">No deposit</option>
                <option value="PERCENT">Percentage</option>
                <option value="FIXED">Fixed amount</option>
              </select>
              {rule.type !== "NONE" && (
                <div className="flex items-center gap-1">
                  {rule.type === "FIXED" && <span className="text-sm text-gray-500">£</span>}
                  <input type="number" min="0" className="w-24 px-3 py-2 border rounded-lg text-sm"
                    value={rule.value || ""}
                    onChange={(e) => update({ value: parseFloat(e.target.value) || 0 })} />
                  {rule.type === "PERCENT" && <span className="text-sm text-gray-500">%</span>}
                </div>
              )}
            </div>
          )
        })}
      </section>

      <section className="bg-white rounded-xl shadow-sm p-5 space-y-3">
        <div className="flex items-center justify-between">
          <h2 className="font-semibold text-brand-navy">Standard Terms & Conditions</h2>
          <button onClick={generateTerms} disabled={generatingTerms}
            className="inline-flex items-center gap-1.5 text-sm text-brand-blue font-medium hover:underline disabled:opacity-50">
            {generatingTerms ? <Loader2 className="w-4 h-4 animate-spin" /> : <Sparkles className="w-4 h-4" />}
            Draft with AI
          </button>
        </div>
        <p className="text-sm text-gray-500">
          Added to every proposal automatically. One term per line. AI drafts are generic
          templates — review carefully, and consider a professional check before relying on them.
        </p>
        <textarea rows={12} className={inputCls} value={org.termsAndConditions || ""}
          onChange={(e) => set("termsAndConditions", e.target.value)}
          placeholder={"Our quotation includes one continuous site visit for the works unless stated otherwise…\nAccess to water supply and electricity is assumed unless specified otherwise…\nPayment terms are 14 days from completion of works…"} />
      </section>

      <button onClick={save} disabled={saving}
        className="w-full sm:w-auto px-6 py-3 bg-brand-blue text-white rounded-lg font-semibold hover:bg-blue-700 transition disabled:opacity-50">
        {saving ? "Saving…" : "Save settings"}
      </button>
    </div>
  )
}

function tryParse(value: string): string[] {
  try {
    const parsed = JSON.parse(value)
    return Array.isArray(parsed) ? parsed : []
  } catch {
    return value.split(",").map((s) => s.trim()).filter(Boolean)
  }
}
