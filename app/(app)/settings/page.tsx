"use client"

import { useEffect, useRef, useState } from "react"
import { toast } from "sonner"
import { Loader2, Upload, Sparkles, Copy, Globe } from "lucide-react"
import { SignatureDraw } from "@/components/signature-draw"

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
  termsCommercial: string | null
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

type Me = {
  id: string
  name: string | null
  email: string
  signOffName: string | null
  headshotUrl: string | null
  signatureImageUrl: string | null
}

type TeamData = {
  users: { id: string; name: string | null; email: string; role: string; headshotUrl: string | null }[]
  invites: { id: string; email: string; token: string }[]
}

export default function SettingsPage() {
  const [org, setOrg] = useState<Org | null>(null)
  const [me, setMe] = useState<Me | null>(null)
  const [team, setTeam] = useState<TeamData | null>(null)
  const [inviteEmail, setInviteEmail] = useState("")
  const [inviting, setInviting] = useState(false)
  const [inviteLink, setInviteLink] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)
  const [generating, setGenerating] = useState(false)
  const [importing, setImporting] = useState(false)
  const logoInput = useRef<HTMLInputElement>(null)

  useEffect(() => {
    fetch("/api/organization")
      .then((r) => r.json())
      .then((data: Org) => setOrg(normalizeOrg(data)))
      .catch(() => toast.error("Failed to load settings"))
    fetch("/api/me").then((r) => r.json()).then(setMe).catch(() => {})
    fetch("/api/team").then((r) => r.json()).then(setTeam).catch(() => {})
  }, [])

  const saveMyName = async (signOffName: string) => {
    setMe((m) => (m ? { ...m, signOffName } : m))
    await fetch("/api/me", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ signOffName }),
    })
  }

  const invite = async () => {
    if (!inviteEmail.trim()) return
    setInviting(true)
    try {
      const res = await fetch("/api/team", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: inviteEmail }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error)
      setInviteLink(data.joinUrl)
      // Attempt an immediate copy for the desktop happy path. On iOS Safari the
      // await above voids the tap's user activation so writeText rejects — that's
      // expected; the link is shown in the box below with a Copy button whose tap
      // is a fresh gesture. Only claim "copied" when it genuinely worked.
      let copied = false
      try {
        await navigator.clipboard.writeText(data.joinUrl)
        copied = true
      } catch {
        /* clipboard blocked (e.g. iOS after async work) — fall back to the box */
      }
      toast.success(
        copied
          ? `Invite sent to ${inviteEmail} — link copied to clipboard`
          : `Invite sent to ${inviteEmail} — copy the link below`
      )
      setInviteEmail("")
      fetch("/api/team").then((r) => r.json()).then(setTeam).catch(() => {})
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Invite failed")
    } finally {
      setInviting(false)
    }
  }

  const copyInviteLink = async () => {
    if (!inviteLink) return
    try {
      await navigator.clipboard.writeText(inviteLink)
      toast.success("Copied to clipboard")
    } catch {
      toast.error("Couldn't copy — select the link and copy it manually")
    }
  }

  const set = (field: keyof Org, value: string | number | null) =>
    setOrg((prev) => (prev ? { ...prev, [field]: value } : prev))

  // Re-pull services, areas and details from the company website (the same
  // extraction used at signup) so they can be refreshed any time. Populates the
  // form only - the user reviews and Saves to keep it.
  const importFromWebsite = async () => {
    if (!org?.website?.trim()) {
      toast.error("Enter your website address first")
      return
    }
    setImporting(true)
    try {
      const res = await fetch("/api/organization/import-from-website", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ url: org.website.trim() }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || "Import failed")
      setOrg((prev) =>
        prev
          ? {
              ...prev,
              website: data.website || prev.website,
              logoUrl: data.logoUrl || prev.logoUrl,
              brandColor: data.brandColor || prev.brandColor,
              email: data.contactEmail || prev.email,
              phone: data.contactPhone || prev.phone,
              youtubeChannelUrl: data.youtubeChannelUrl || prev.youtubeChannelUrl,
              mainServices: data.services?.length ? data.services.join(", ") : prev.mainServices,
              areasCovered: data.areasCovered?.length ? data.areasCovered.join(", ") : prev.areasCovered,
              yearEstablished: data.yearEstablished ?? prev.yearEstablished,
              mainUSP: data.mainUSP || prev.mainUSP,
              reviewCount: data.reviewCount ?? prev.reviewCount,
              whyChooseUs: data.whyChooseUs || prev.whyChooseUs,
            }
          : prev
      )
      toast.success("Imported from your website — review and Save to keep it")
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Import failed")
    } finally {
      setImporting(false)
    }
  }

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
          termsCommercial: org.termsCommercial || "",
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
    if (kind === "logo") set("logoUrl", url)
    else if (kind === "headshot") setMe((m) => (m ? { ...m, headshotUrl: url } : m))
    else setMe((m) => (m ? { ...m, signatureImageUrl: url } : m))
    toast.success("Image updated")
  }
  const uploadLogo = (file: File | undefined) => uploadImage(file, "logo")

  const [generatingTerms, setGeneratingTerms] = useState<"residential" | "commercial" | null>(null)
  const generateTerms = async (type: "residential" | "commercial") => {
    setGeneratingTerms(type)
    try {
      const res = await fetch("/api/organization/generate-terms", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ type }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error)
      set(type === "commercial" ? "termsCommercial" : "termsAndConditions", data.terms)
      toast.success("Draft terms added — review and edit, then Save")
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to draft terms")
    } finally {
      setGeneratingTerms(null)
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
            <div className="flex gap-2">
              <input className={inputCls} value={org.website || ""} onChange={(e) => set("website", e.target.value)} />
              <button type="button" onClick={importFromWebsite} disabled={importing}
                className="shrink-0 inline-flex items-center gap-1.5 px-3 py-2 bg-brand-navy text-white rounded-lg text-sm font-semibold hover:bg-slate-800 disabled:opacity-50">
                {importing ? <Loader2 className="w-4 h-4 animate-spin" /> : <Globe className="w-4 h-4" />}
                <span className="hidden sm:inline">{importing ? "Importing…" : "Import"}</span>
              </button>
            </div>
            <p className="text-xs text-gray-400 mt-1">
              Re-pull your services, areas and details from your site. Review, then Save.
            </p>
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
          <div className="sm:col-span-2">
            <label className={labelCls}>Main services (comma separated)</label>
            <input className={inputCls} placeholder="Roof cleaning, Gutter clearance, Render cleaning"
              value={org.mainServices || ""} onChange={(e) => set("mainServices", e.target.value)} />
            <p className="text-xs text-gray-400 mt-1">
              Used to tailor proposal wording and your T&amp;Cs. Empty services is why terms come out generic.
            </p>
          </div>
          <div className="sm:col-span-2">
            <label className={labelCls}>Areas covered (comma separated)</label>
            <input className={inputCls} placeholder="London, Surrey, Kent"
              value={org.areasCovered || ""} onChange={(e) => set("areasCovered", e.target.value)} />
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
        <h2 className="font-semibold text-brand-navy">Team</h2>
        <p className="text-sm text-gray-500">
          Everyone here shares this organisation&apos;s surveys, proposals and settings.
        </p>
        <div className="space-y-2">
          {team?.users.map((u) => (
            <div key={u.id} className="flex items-center gap-3">
              {u.headshotUrl ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={u.headshotUrl} alt="" className="w-8 h-8 rounded-full object-cover" />
              ) : (
                <div className="w-8 h-8 rounded-full bg-brand-navy text-white flex items-center justify-center text-xs font-bold">
                  {(u.name || u.email)[0].toUpperCase()}
                </div>
              )}
              <div className="min-w-0">
                <div className="text-sm font-medium truncate">{u.name || u.email}</div>
                <div className="text-xs text-gray-400 truncate">{u.email} · {u.role.toLowerCase()}</div>
              </div>
            </div>
          ))}
          {team?.invites.map((i) => (
            <div key={i.id} className="flex items-center gap-3 opacity-60">
              <div className="w-8 h-8 rounded-full border-2 border-dashed" />
              <div className="text-sm">{i.email} <span className="text-xs text-amber-600">invited</span></div>
            </div>
          ))}
        </div>
        <div className="flex gap-2">
          <input className={inputCls} type="email" placeholder="colleague@company.co.uk"
            value={inviteEmail} onChange={(e) => setInviteEmail(e.target.value)} />
          <button onClick={invite} disabled={inviting}
            className="shrink-0 px-4 py-2 bg-brand-blue text-white rounded-lg text-sm font-semibold hover:bg-blue-700 disabled:opacity-50">
            {inviting ? "Inviting…" : "Invite"}
          </button>
        </div>
        {inviteLink && (
          <div className="flex flex-wrap items-center gap-2 rounded-lg border border-brand-blue/30 bg-blue-50 px-3 py-2">
            <input
              readOnly
              value={inviteLink}
              onFocus={(e) => e.currentTarget.select()}
              className="flex-1 min-w-0 bg-white border rounded-md px-2 py-1.5 text-sm text-gray-700"
            />
            <button onClick={copyInviteLink}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 border rounded-lg text-sm font-medium bg-white hover:bg-gray-50">
              <Copy className="w-4 h-4" /> Copy
            </button>
          </div>
        )}
      </section>

      <section className="bg-white rounded-xl shadow-sm p-5 space-y-4">
        <h2 className="font-semibold text-brand-navy">Your personal sign-off</h2>
        <p className="text-sm text-gray-500">
          Shown at the bottom of proposals <strong>you</strong> create — each team member sets their own.
        </p>
        <div>
          <label className={labelCls}>Your name (as signed)</label>
          <input className={inputCls} placeholder="e.g. Conan Sammon, Managing Director"
            value={me?.signOffName || ""} onChange={(e) => saveMyName(e.target.value)} />
        </div>
        <div>
          <label className={labelCls}>Headshot</label>
          <div className="flex items-center gap-3">
            {me?.headshotUrl ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={me.headshotUrl} alt="Headshot" className="w-16 h-16 rounded-full object-cover border" />
            ) : (
              <div className="w-16 h-16 rounded-full border-2 border-dashed flex items-center justify-center text-gray-300 text-xs">
                None
              </div>
            )}
            <label className="inline-flex items-center gap-2 px-3 py-1.5 border rounded-lg text-xs font-medium hover:bg-gray-50 cursor-pointer">
              <Upload className="w-3.5 h-3.5" /> Upload photo
              <input type="file" accept="image/*" className="hidden"
                onChange={(e) => uploadImage(e.target.files?.[0], "headshot")} />
            </label>
          </div>
        </div>
        <div>
          <label className={labelCls}>Your signature</label>
          {me?.signatureImageUrl && (
            <div className="flex items-center gap-2 mb-2">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={me.signatureImageUrl} alt="Current signature"
                className="h-10 object-contain border rounded p-1 bg-white" />
              <span className="text-xs text-gray-400">Current — draw below to replace</span>
            </div>
          )}
          <SignatureDraw
            onSaved={(url) => setMe((m) => (m ? { ...m, signatureImageUrl: url } : m))}
          />
        </div>
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

      <section className="bg-white rounded-xl shadow-sm p-5 space-y-4">
        <h2 className="font-semibold text-brand-navy">Standard Terms & Conditions</h2>
        <p className="text-sm text-gray-500">
          Added to every proposal automatically based on the job&apos;s property type. One term
          per line. AI drafts are generic templates — review carefully, and consider a
          professional check before relying on them.
        </p>
        {(
          [
            ["residential", "Residential clients", "termsAndConditions", org.termsAndConditions],
            ["commercial", "Commercial clients", "termsCommercial", org.termsCommercial],
          ] as const
        ).map(([type, label, field, value]) => (
          <div key={type}>
            <div className="flex items-center justify-between mb-1">
              <span className="text-sm font-medium text-gray-700">{label}</span>
              <button onClick={() => generateTerms(type)} disabled={generatingTerms !== null}
                className="inline-flex items-center gap-1.5 text-sm text-brand-blue font-medium hover:underline disabled:opacity-50">
                {generatingTerms === type ? <Loader2 className="w-4 h-4 animate-spin" /> : <Sparkles className="w-4 h-4" />}
                Draft with AI
              </button>
            </div>
            <textarea rows={9} className={inputCls} value={value || ""}
              onChange={(e) => set(field, e.target.value)}
              placeholder={type === "commercial"
                ? "Leave empty to use the residential terms for commercial jobs too…"
                : "Our quotation includes one continuous site visit for the works unless stated otherwise…"} />
          </div>
        ))}
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

// The DB stores services/areas as JSON strings; the form edits them as plain
// comma-separated text. Normalise on load so the inputs show clean text and
// save() (which runs them back through tryParse) round-trips correctly.
function normalizeOrg(o: Org): Org {
  return {
    ...o,
    mainServices: o.mainServices ? tryParse(o.mainServices).join(", ") : "",
    areasCovered: o.areasCovered ? tryParse(o.areasCovered).join(", ") : "",
  }
}
