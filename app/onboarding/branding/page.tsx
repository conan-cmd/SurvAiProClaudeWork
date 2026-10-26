"use client"

import { useState } from "react"
import { useRouter } from "next/navigation"
import { toast } from "sonner"
import { ArrowRight, ArrowLeft, Sparkles, Loader2, Globe, Clock, Search, Check } from "lucide-react"
import { StripeConnect } from "@/components/stripe-connect"

const TONES = [
  { value: "FRIENDLY", label: "Friendly", desc: "Warm and approachable" },
  { value: "PROFESSIONAL", label: "Professional", desc: "Clear and businesslike" },
  { value: "PREMIUM", label: "Premium", desc: "Polished and high-end" },
  { value: "TECHNICAL", label: "Technical", desc: "Detailed and precise" },
]

const STEP_TITLES = ["Company details", "Brand & positioning", "Review sections", "Get paid & sign-off"]

type Sections = {
  aboutUsSection: string
  whyChooseUsSection: string
  ourExperienceSection: string
  ourApproachSection: string
}

export default function OnboardingPage() {
  const router = useRouter()
  const [step, setStep] = useState(0)
  const [saving, setSaving] = useState(false)
  const [generating, setGenerating] = useState(false)
  const [importing, setImporting] = useState(false)
  const [logoUrl, setLogoUrl] = useState<string | null>(null)
  // Step 4: deposits, Google reviews and personal sign-off.
  const [suggestedHeadshot, setSuggestedHeadshot] = useState<string | null>(null)
  const [headshotUrl, setHeadshotUrl] = useState<string | null>(null)
  const [signOffName, setSignOffName] = useState("")
  const [depositRes, setDepositRes] = useState("50")   // % | "0" | "fixed"
  const [depositCom, setDepositCom] = useState("25")
  const [depositResFixed, setDepositResFixed] = useState("")
  const [depositComFixed, setDepositComFixed] = useState("")
  const [gQuery, setGQuery] = useState("")
  const [gHits, setGHits] = useState<{ placeId: string; name: string; address: string }[] | null>(null)
  const [gBusy, setGBusy] = useState(false)
  const [gConnected, setGConnected] = useState<string | null>(null)

  const [form, setForm] = useState({
    website: "",
    brandColor: "#2563EB",
    secondaryColor: "#10B981",
    email: "",
    phone: "",
    youtubeChannelUrl: "",
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

  const importFromWebsite = async () => {
    if (!form.website.trim()) {
      toast.error("Enter your website address first")
      return
    }
    setImporting(true)
    try {
      const res = await fetch("/api/organization/import-from-website", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ url: form.website.trim() }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || "Import failed")

      setForm((prev) => ({
        ...prev,
        website: data.website || prev.website,
        email: data.contactEmail || prev.email,
        phone: data.contactPhone || prev.phone,
        youtubeChannelUrl: data.youtubeChannelUrl || prev.youtubeChannelUrl,
        mainServices: data.services?.length ? data.services.join(", ") : prev.mainServices,
        areasCovered: data.areasCovered?.length ? data.areasCovered.join(", ") : prev.areasCovered,
        yearEstablished: data.yearEstablished ? String(data.yearEstablished) : prev.yearEstablished,
        mainUSP: data.mainUSP || prev.mainUSP,
        reviewCount: data.reviewCount ? String(data.reviewCount) : prev.reviewCount,
        whyChooseUs: data.whyChooseUs || prev.whyChooseUs,
        brandColor: data.brandColor || prev.brandColor,
        secondaryColor: data.secondaryColor || prev.secondaryColor,
        proposalTone: data.suggestedTone || prev.proposalTone,
      }))
      if (data.logoUrl) setLogoUrl(data.logoUrl)
      if (data.suggestedHeadshotUrl) setSuggestedHeadshot(data.suggestedHeadshotUrl)

      toast.success("Details imported — please check everything before continuing")
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Import failed")
    } finally {
      setImporting(false)
    }
  }

  const saveDetails = async () => {
    setSaving(true)
    try {
      const res = await fetch("/api/organization", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          website: form.website || "",
          youtubeChannelUrl: form.youtubeChannelUrl || "",
          ...(logoUrl && { logoUrl }),
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
    if (step === 3) {
      // Persist the reviewed sections before the final step.
      await fetch("/api/organization", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(sections),
      }).catch(() => {})
    }
    setStep(step + 1)
  }

  const depositRule = (choice: string, fixed: string) =>
    choice === "0"
      ? { type: "NONE", value: 0 }
      : choice === "fixed"
        ? { type: "FIXED", value: parseFloat(fixed) || 0 }
        : { type: "PERCENT", value: parseInt(choice) || 0 }

  const finish = async () => {
    setSaving(true)
    try {
      const res = await fetch("/api/organization", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ...sections,
          depositRules: JSON.stringify({
            residential: depositRule(depositRes, depositResFixed),
            commercial: depositRule(depositCom, depositComFixed),
          }),
          onboardingComplete: true,
        }),
      })
      if (!res.ok) throw new Error((await res.json()).error)
      // Personal sign-off (best-effort — editable in Settings any time).
      if (signOffName.trim() || headshotUrl) {
        await fetch("/api/me", {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            ...(signOffName.trim() ? { signOffName: signOffName.trim() } : {}),
            ...(headshotUrl ? { headshotUrl } : {}),
          }),
        }).catch(() => {})
      }
      toast.success("Setup complete!")
      router.push("/dashboard")
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed to save")
    } finally {
      setSaving(false)
    }
  }

  // Leave setup for later — the dashboard keeps a gentle reminder to finish.
  const skip = () => router.push("/dashboard")

  const inputCls =
    "w-full px-4 py-2.5 border rounded-lg focus:outline-none focus:ring-2 focus:ring-brand-blue text-base"
  const labelCls = "block text-sm font-medium text-gray-700 mb-1"

  return (
    <div className="min-h-screen bg-brand-gray p-4 pb-24">
      <div className="max-w-2xl mx-auto pt-8">
        {/* Progress + skip (hidden on the welcome screen) */}
        {step >= 1 && (
          <div className="mb-8">
            <div className="flex items-center justify-between mb-2">
              <span className="text-sm font-semibold text-brand-navy">
                Step {step} of 4 · <span className="font-medium text-gray-500">{STEP_TITLES[step - 1]}</span>
              </span>
              <button onClick={skip} className="text-sm text-gray-400 hover:text-gray-600 font-medium">
                Skip for now
              </button>
            </div>
            <div className="flex items-center gap-2">
              {[1, 2, 3, 4].map((s) => (
                <div key={s}
                  className={`h-2 flex-1 rounded-full transition ${s <= step ? "bg-brand-blue" : "bg-gray-200"}`} />
              ))}
            </div>
          </div>
        )}

        {step === 0 && (
          <div className="bg-white rounded-xl shadow-sm p-8 md:p-10 text-center animate-fadeIn">
            <div className="w-16 h-16 mx-auto mb-5 rounded-2xl bg-blue-50 flex items-center justify-center">
              <Sparkles className="w-8 h-8 text-brand-blue" />
            </div>
            <h1 className="text-2xl md:text-3xl font-bold text-brand-navy mb-3">Welcome to SurvAIPro® 🎉</h1>
            <p className="text-gray-600 mb-2 max-w-md mx-auto">
              Let&apos;s take two minutes to add your company details, branding and services.
            </p>
            <p className="text-gray-500 text-sm mb-5 max-w-md mx-auto">
              It means your very first proposal comes out polished and on-brand — no digging through
              settings later. You can change anything at any time.
            </p>
            <div className="inline-flex items-center gap-2 text-sm font-medium text-brand-blue bg-blue-50 rounded-full px-4 py-1.5 mb-8">
              <Clock className="w-4 h-4" /> Just 3 quick steps · about 2 minutes
            </div>
            <div className="flex flex-col sm:flex-row gap-3 justify-center">
              <button onClick={() => setStep(1)}
                className="inline-flex items-center justify-center gap-2 px-6 py-3 bg-brand-blue text-white rounded-lg font-semibold hover:bg-blue-700">
                Set up my account <ArrowRight className="w-4 h-4" />
              </button>
              <button onClick={skip}
                className="inline-flex items-center justify-center gap-2 px-6 py-3 rounded-lg border font-medium text-gray-600 hover:bg-gray-50">
                Skip — I&apos;ll jump straight in
              </button>
            </div>
            <p className="text-xs text-gray-400 mt-5">You can finish setup any time from your dashboard.</p>
          </div>
        )}

        {step === 1 && (
          <div className="bg-white rounded-xl shadow-sm p-6 md:p-8 animate-fadeIn">
            <h1 className="text-2xl font-bold text-brand-navy mb-1">Company details</h1>
            <p className="text-gray-600 mb-6">Tell us about your business</p>

            <div className="space-y-4">
              <div>
                <label className={labelCls}>Website</label>
                <div className="flex gap-2">
                  <input type="url" placeholder="https://yourcompany.co.uk" className={inputCls}
                    value={form.website} onChange={(e) => set("website", e.target.value)} />
                  <button type="button" onClick={importFromWebsite} disabled={importing}
                    className="shrink-0 inline-flex items-center gap-1.5 px-4 py-2.5 bg-brand-navy text-white rounded-lg text-sm font-semibold hover:bg-slate-800 transition disabled:opacity-50">
                    {importing ? (
                      <Loader2 className="w-4 h-4 animate-spin" />
                    ) : (
                      <Globe className="w-4 h-4" />
                    )}
                    <span className="hidden sm:inline">{importing ? "Importing…" : "Import"}</span>
                  </button>
                </div>
                <p className="text-xs text-gray-400 mt-1">
                  We&apos;ll pull your logo, colours, services and contact details from your site.
                  You review everything before it&apos;s used.
                </p>
              </div>
              {logoUrl && (
                <div className="flex items-center gap-3 bg-blue-50 border border-blue-100 rounded-lg p-3">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={logoUrl} alt="Imported logo" className="h-12 max-w-[120px] object-contain bg-white rounded p-1" />
                  <div className="text-sm text-gray-600 flex-1">Logo found on your site</div>
                  <button type="button" onClick={() => setLogoUrl(null)}
                    className="text-xs text-gray-400 hover:text-red-500 font-medium">
                    Remove
                  </button>
                </div>
              )}
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
                <label className={labelCls}>YouTube channel (optional)</label>
                <input type="url" placeholder="https://www.youtube.com/@YourChannel" className={inputCls}
                  value={form.youtubeChannelUrl} onChange={(e) => set("youtubeChannelUrl", e.target.value)} />
                <p className="text-xs text-gray-400 mt-1">
                  SurvAIPro® will suggest videos of similar jobs to include in your proposals.
                </p>
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
                <textarea spellCheck rows={3} placeholder="Fast turnaround, tidy work, fully insured..." className={inputCls}
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
                    <textarea spellCheck rows={5} className={inputCls}
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

        {step === 4 && (
          <div className="space-y-5 animate-fadeIn">
            <div className="bg-white rounded-xl shadow-sm p-6 md:p-8">
              <h1 className="text-2xl font-bold text-brand-navy mb-1">Get paid &amp; sign off</h1>
              <p className="text-gray-600 mb-5">
                Three quick wins — all optional, all changeable later in Settings.
              </p>

              {/* Deposits */}
              <div className="space-y-3 border rounded-xl p-4 mb-4">
                <p className="font-semibold text-brand-navy text-sm">Deposits</p>
                <p className="text-xs text-gray-500">
                  When a client signs a proposal, SurvAIPro® can take a deposit by card there and then.
                </p>
                <div className="grid sm:grid-cols-2 gap-3">
                  {([["Residential jobs", depositRes, setDepositRes, depositResFixed, setDepositResFixed],
                     ["Commercial jobs", depositCom, setDepositCom, depositComFixed, setDepositComFixed]] as const
                  ).map(([label, value, setValue, fixed, setFixed]) => (
                    <div key={label}>
                      <label className={labelCls}>{label}</label>
                      <select className={inputCls} value={value} onChange={(e) => setValue(e.target.value)}>
                        <option value="0">No deposit</option>
                        <option value="10">10% deposit</option>
                        <option value="25">25% deposit</option>
                        <option value="50">50% deposit</option>
                        <option value="fixed">Fixed amount (£)</option>
                      </select>
                      {value === "fixed" && (
                        <input type="number" min="0" className={`${inputCls} mt-2`} placeholder="e.g. 100"
                          value={fixed} onChange={(e) => setFixed(e.target.value)} />
                      )}
                    </div>
                  ))}
                </div>
              </div>
              <StripeConnect />

              {/* Google reviews */}
              <div className="space-y-3 border rounded-xl p-4 my-4">
                <p className="font-semibold text-brand-navy text-sm">Google reviews</p>
                {gConnected ? (
                  <p className="text-sm text-emerald-700 flex items-center gap-1.5">
                    <Check className="w-4 h-4" /> Connected to {gConnected} — your best reviews will be suggested on proposals.
                  </p>
                ) : (
                  <>
                    <p className="text-xs text-gray-500">
                      Find your Google Business profile and we&apos;ll pull in your most relevant reviews
                      to show on proposals.
                    </p>
                    <div className="flex gap-2">
                      <input className={inputCls} placeholder="Your business name & town"
                        value={gQuery} onChange={(e) => setGQuery(e.target.value)} />
                      <button type="button" disabled={gBusy || !gQuery.trim()}
                        onClick={async () => {
                          setGBusy(true)
                          try {
                            const d = await fetch(`/api/google-reviews?q=${encodeURIComponent(gQuery)}`).then((r) => r.json())
                            setGHits(Array.isArray(d.results) ? d.results : [])
                          } catch { toast.error("Search failed") } finally { setGBusy(false) }
                        }}
                        className="shrink-0 inline-flex items-center gap-1.5 px-4 py-2 border rounded-lg text-sm font-medium hover:border-brand-blue hover:text-brand-blue disabled:opacity-50">
                        {gBusy ? <Loader2 className="w-4 h-4 animate-spin" /> : <Search className="w-4 h-4" />} Find
                      </button>
                    </div>
                    {gHits && (gHits.length ? (
                      <div className="space-y-1.5">
                        {gHits.map((h) => (
                          <button key={h.placeId} type="button" disabled={gBusy}
                            onClick={async () => {
                              setGBusy(true)
                              try {
                                const res = await fetch("/api/google-reviews", {
                                  method: "POST",
                                  headers: { "Content-Type": "application/json" },
                                  body: JSON.stringify({ placeId: h.placeId }),
                                })
                                const d = await res.json()
                                if (!res.ok) throw new Error(d.error)
                                setGConnected(d.name || h.name)
                                toast.success(`Connected to ${d.name || h.name}`)
                              } catch (e) {
                                toast.error(e instanceof Error ? e.message : "Couldn't connect")
                              } finally { setGBusy(false) }
                            }}
                            className="w-full text-left border rounded-lg p-2.5 text-sm hover:border-brand-blue">
                            <span className="font-medium text-gray-800">{h.name}</span>
                            <span className="block text-xs text-gray-500">{h.address}</span>
                          </button>
                        ))}
                      </div>
                    ) : <p className="text-xs text-gray-400">No matches — try adding your town.</p>)}
                  </>
                )}
              </div>

              {/* Personal sign-off */}
              <div className="space-y-3 border rounded-xl p-4">
                <p className="font-semibold text-brand-navy text-sm">Your sign-off</p>
                <p className="text-xs text-gray-500">
                  Shown at the bottom of proposals you send — a name and a friendly face win trust.
                </p>
                <div>
                  <label className={labelCls}>Your name (as signed)</label>
                  <input className={inputCls} placeholder="e.g. Sam Taylor, Director"
                    value={signOffName} onChange={(e) => setSignOffName(e.target.value)} />
                </div>
                <div className="flex items-center gap-4">
                  {(headshotUrl || suggestedHeadshot) && (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={headshotUrl || suggestedHeadshot || ""} alt="Headshot"
                      className={`w-16 h-16 rounded-full object-cover border-2 ${headshotUrl ? "border-emerald-400" : "border-gray-200"}`} />
                  )}
                  <div className="space-y-1.5">
                    {suggestedHeadshot && !headshotUrl && (
                      <button type="button" onClick={() => { setHeadshotUrl(suggestedHeadshot); toast.success("Headshot set — saved when you finish") }}
                        className="block text-sm font-medium text-brand-blue hover:underline">
                        Use this photo from your website
                      </button>
                    )}
                    {headshotUrl && <p className="text-xs text-emerald-700">Headshot ready — saved when you finish.</p>}
                    <label className="block text-sm font-medium text-gray-500 hover:text-brand-blue cursor-pointer">
                      {headshotUrl || suggestedHeadshot ? "Upload a different photo" : "Upload a headshot"}
                      <input type="file" accept="image/*" className="hidden"
                        onChange={async (e) => {
                          const file = e.target.files?.[0]
                          if (!file) return
                          const fd = new FormData()
                          fd.append("file", file)
                          fd.append("kind", "headshot")
                          const res = await fetch("/api/organization/logo", { method: "POST", body: fd })
                          if (res.ok) { setHeadshotUrl((await res.json()).url); toast.success("Headshot uploaded") }
                          else toast.error("Upload failed")
                        }} />
                    </label>
                    <p className="text-xs text-gray-400">You can draw your signature in Settings later.</p>
                  </div>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Nav buttons */}
        {step >= 1 && (
        <div className="flex justify-between mt-6">
          {step > 1 ? (
            <button onClick={() => setStep(step - 1)}
              className="inline-flex items-center gap-2 px-5 py-2.5 rounded-lg border font-medium text-gray-700 hover:bg-gray-50">
              <ArrowLeft className="w-4 h-4" /> Back
            </button>
          ) : (
            <div />
          )}

          {step < 4 ? (
            <button onClick={handleNext} disabled={saving || (step === 3 && generating)}
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
        )}
      </div>
    </div>
  )
}
