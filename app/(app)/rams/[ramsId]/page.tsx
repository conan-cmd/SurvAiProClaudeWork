"use client"

import { useEffect, useRef, useState } from "react"
import { useParams } from "next/navigation"
import Link from "next/link"
import { toast } from "sonner"
import {
  Loader2, Sparkles, Plus, Trash2, Printer, ClipboardList, FileText,
  AlertTriangle, Check, Send, MessageCircle, Copy, Link2, X,
  Footprints, Shirt, Hand, Glasses, Umbrella, HardHat, Ear, Wind, LifeBuoy, Shield, ShieldCheck,
} from "lucide-react"
import type { LucideIcon } from "lucide-react"

// Common PPE for exterior-cleaning / trade work, shown as a selectable icon grid.
// Uses inline SVG (lucide) icons — unlike emoji, these rasterise reliably in the
// exported PDF (html2canvas frequently drops emoji glyphs).
const PPE_PRESETS: { label: string; Icon: LucideIcon }[] = [
  { label: "Safety boots", Icon: Footprints },
  { label: "Hi-vis clothing", Icon: Shirt },
  { label: "Protective gloves", Icon: Hand },
  { label: "Eye protection / goggles", Icon: Glasses },
  { label: "Waterproof clothing", Icon: Umbrella },
  { label: "Hard hat", Icon: HardHat },
  { label: "Ear protection", Icon: Ear },
  { label: "Dust mask / RPE", Icon: Wind },
  { label: "Harness & fall protection", Icon: LifeBuoy },
  { label: "Face shield", Icon: Shield },
]
// Best-match icon for any PPE label (presets + free-text extras).
function ppeIconFor(label: string): LucideIcon {
  const p = PPE_PRESETS.find((x) => x.label.trim().toLowerCase() === label.trim().toLowerCase())
  return p ? p.Icon : ShieldCheck
}

type Hazard = {
  hazard: string; whoAtRisk: string; controls: string; ppe: string
  preP?: number; preS?: number; resP?: number; resS?: number
}
type Operative = {
  id?: string; name: string; phone: string; email: string
  signatureImage?: string; signedAt?: string
}
type MethodGroup = { title: string; steps: string[] }

// One drafted COSHH assessment per chemical used on the job. AI-drafted — the
// user must verify each against the product's actual Safety Data Sheet.
type CoshhAssessment = {
  substance: string; use: string; form: string; hazards: string; routes: string
  whoAtRisk: string; controls: string; ppe: string; storage: string; spill: string
  firstAid: string; disposal: string
}
const EMPTY_COSHH: CoshhAssessment = {
  substance: "", use: "", form: "", hazards: "", routes: "", whoAtRisk: "",
  controls: "", ppe: "", storage: "", spill: "", firstAid: "", disposal: "",
}
const COSHH_FIELDS: { key: keyof CoshhAssessment; label: string }[] = [
  { key: "use", label: "Used for" },
  { key: "form", label: "Form" },
  { key: "hazards", label: "Hazards (GHS)" },
  { key: "routes", label: "Routes of exposure" },
  { key: "whoAtRisk", label: "Who is at risk" },
  { key: "controls", label: "Exposure controls & safe working" },
  { key: "ppe", label: "PPE for handling" },
  { key: "storage", label: "Storage & transport" },
  { key: "spill", label: "Spill / accidental release" },
  { key: "firstAid", label: "First aid" },
  { key: "disposal", label: "Disposal" },
]

// Method statement is now grouped into phases. Older RAMS stored a flat string[] —
// wrap those into a single untitled phase so nothing is lost.
function parseMethod(raw: string | null): MethodGroup[] {
  try {
    const arr = raw ? JSON.parse(raw) : []
    if (!Array.isArray(arr) || arr.length === 0) return []
    if (typeof arr[0] === "string") return [{ title: "", steps: arr as string[] }]
    return (arr as MethodGroup[]).map((g) => ({ title: g.title || "", steps: Array.isArray(g.steps) ? g.steps : [] }))
  } catch {
    return []
  }
}
type Sections = {
  activity: string
  scopeOfWorks: string
  numOperatives: string
  siteSupervisor: string
  emergencyContacts: string
  nearestHospital: string
  descriptionOfWorks: string
  responsibilities: string[]
  equipment: string[]
  environmentalControls: string[]
  emergencyProcedures: string[]
  coshh: string[]
  coshhAssessments: CoshhAssessment[]
  competency: string[]
  operatives: Operative[]
}
const EMPTY_SECTIONS: Sections = {
  activity: "", scopeOfWorks: "", numOperatives: "", siteSupervisor: "", emergencyContacts: "",
  nearestHospital: "", descriptionOfWorks: "", responsibilities: [], equipment: [], environmentalControls: [],
  emergencyProcedures: [], coshh: [], coshhAssessments: [], competency: [], operatives: [],
}

// Risk ranking (P × S) colour bands, matching LBC's key.
function rrBand(v: number): { cls: string; label: string } {
  if (!v) return { cls: "bg-gray-100 text-gray-400", label: "—" }
  if (v >= 16) return { cls: "bg-red-600 text-white", label: "Urgent" }
  if (v >= 11) return { cls: "bg-orange-500 text-white", label: "High" }
  if (v >= 8) return { cls: "bg-yellow-400 text-gray-900", label: "Medium" }
  if (v >= 2) return { cls: "bg-green-500 text-white", label: "Low" }
  return { cls: "bg-green-600 text-white", label: "No action" }
}

type Rams = {
  id: string
  hazards: string | null
  methodStatement: string | null
  ppe: string | null
  siteInfo: string | null
  sections: string | null
  survey: {
    id: string
    title: string
    clientName: string
    clientEmail: string | null
    clientAddress: string
    serviceType: string
    proposal: { id: string } | null
  }
  organization: { id: string; name: string; logoUrl: string | null; brandColor: string; phone: string | null; email: string | null }
}

function parse<T>(s: string | null, fallback: T): T {
  try {
    return s ? (JSON.parse(s) as T) : fallback
  } catch {
    return fallback
  }
}

export default function RamsPage() {
  const { ramsId } = useParams<{ ramsId: string }>()
  const [rams, setRams] = useState<Rams | null>(null)
  const [hazards, setHazards] = useState<Hazard[]>([])
  const [method, setMethod] = useState<MethodGroup[]>([])
  const [ppe, setPpe] = useState<string[]>([])
  const [siteInfo, setSiteInfo] = useState("")
  const [sections, setSections] = useState<Sections>(EMPTY_SECTIONS)
  const [saveState, setSaveState] = useState<"idle" | "saving" | "saved">("idle")
  const [regenerating, setRegenerating] = useState(false)
  const [sendingOps, setSendingOps] = useState(false)
  const [shareUrl, setShareUrl] = useState<string | null>(null)
  const [pdfBusy, setPdfBusy] = useState(false)
  const [sendOpen, setSendOpen] = useState(false)
  // Document library — surfaced in the COSHH section so SDS sheets get attached.
  const [documents, setDocuments] = useState<{ id: string; name: string; fileUrl: string }[]>([])
  const [uploadingSds, setUploadingSds] = useState(false)
  const sdsInput = useRef<HTMLInputElement>(null)

  useEffect(() => {
    fetch("/api/documents")
      .then((r) => r.json())
      .then((d) => Array.isArray(d) && setDocuments(d))
      .catch(() => {})
  }, [])

  const uploadSds = async (file: File | undefined) => {
    if (!file || !rams) return
    setUploadingSds(true)
    try {
      const { upload } = await import("@vercel/blob/client")
      const blob = await upload(
        `organizations/${rams.organization.id}/documents/${Date.now()}-${file.name}`,
        file,
        { access: "public", handleUploadUrl: "/api/blob/upload" }
      )
      const res = await fetch("/api/documents", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: file.name, fileUrl: blob.url, fileType: file.type, fileSize: file.size }),
      })
      if (!res.ok) throw new Error((await res.json()).error || "Upload failed")
      const doc = await res.json()
      setDocuments((d) => [doc, ...d])
      toast.success("SDS added to your document library")
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Couldn't upload the SDS")
    } finally {
      setUploadingSds(false)
      if (sdsInput.current) sdsInput.current.value = ""
    }
  }
  const [sendTo, setSendTo] = useState("")
  const [sendMessage, setSendMessage] = useState("")
  const [sending, setSending] = useState(false)
  const pdfRef = useRef<HTMLDivElement>(null)
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null)
  // Accumulate concurrent field edits so a quick edit to one field never drops
  // a pending edit to another before the debounced flush fires.
  const pending = useRef<Record<string, unknown>>({})

  useEffect(() => {
    fetch(`/api/rams/${ramsId}`)
      .then((r) => {
        if (!r.ok) throw new Error()
        return r.json()
      })
      .then((d: Rams) => {
        setRams(d)
        setHazards(parse<Hazard[]>(d.hazards, []))
        setMethod(parseMethod(d.methodStatement))
        setPpe(parse<string[]>(d.ppe, []))
        setSiteInfo(d.siteInfo || "")
        setSections({ ...EMPTY_SECTIONS, ...parse<Partial<Sections>>(d.sections, {}) })
      })
      .catch(() => toast.error("Failed to load RAMS"))
  }, [ramsId])

  const save = (patch: Record<string, unknown>) => {
    pending.current = { ...pending.current, ...patch }
    setSaveState("saving")
    if (timer.current) clearTimeout(timer.current)
    timer.current = setTimeout(async () => {
      const body = pending.current
      pending.current = {}
      const res = await fetch(`/api/rams/${ramsId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      })
      setSaveState(res.ok ? "saved" : "idle")
    }, 700)
  }

  // Update one field of the sections blob and persist the whole blob.
  const setSection = <K extends keyof Sections>(field: K, value: Sections[K]) => {
    const next = { ...sections, [field]: value }
    setSections(next)
    save({ sections: next })
  }

  const regenerate = async () => {
    if (!rams) return
    if (!confirm("Regenerate the draft? This replaces the current hazards, method statement and other sections.")) return
    setRegenerating(true)
    const res = await fetch(`/api/surveys/${rams.survey.id}/rams`, { method: "POST" })
    setRegenerating(false)
    if (res.ok) {
      toast.success("Draft regenerated — please review it")
      window.location.reload()
    } else toast.error("Couldn't regenerate")
  }

  if (!rams) {
    return (
      <div className="flex justify-center py-20">
        <Loader2 className="w-8 h-8 animate-spin text-brand-blue" />
      </div>
    )
  }

  const setHaz = (i: number, field: keyof Hazard, value: string) => {
    const next = hazards.map((h, j) => (j === i ? { ...h, [field]: value } : h))
    setHazards(next)
    save({ hazards: next })
  }
  const addHaz = () => {
    const next = [...hazards, { hazard: "", whoAtRisk: "", controls: "", ppe: "" }]
    setHazards(next)
    save({ hazards: next })
  }
  const rmHaz = (i: number) => {
    const next = hazards.filter((_, j) => j !== i)
    setHazards(next)
    save({ hazards: next })
  }
  const setHazScore = (i: number, field: "preP" | "preS" | "resP" | "resS", value: number) => {
    const next = hazards.map((h, j) => (j === i ? { ...h, [field]: value } : h))
    setHazards(next)
    save({ hazards: next })
  }
  // Operatives on site (name / phone / email) live inside the sections blob.
  const addOp = () =>
    setSection("operatives", [...sections.operatives, { id: crypto.randomUUID(), name: "", phone: "", email: "" }])
  const setOp = (i: number, field: keyof Operative, value: string) =>
    setSection("operatives", sections.operatives.map((o, j) => (j === i ? { ...o, [field]: value } : o)))
  const rmOp = (i: number) =>
    setSection("operatives", sections.operatives.filter((_, j) => j !== i))

  // The public no-login link operatives open to read & sign. Minted on first use.
  const getShareLink = async (): Promise<string | null> => {
    if (shareUrl) return shareUrl
    try {
      const res = await fetch(`/api/rams/${ramsId}/share-link`, { method: "POST" })
      const d = await res.json()
      if (!res.ok) throw new Error(d.error)
      setShareUrl(d.url)
      return d.url as string
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Couldn't create link")
      return null
    }
  }
  // UK-friendly wa.me number: strip non-digits, 0-prefix → 44.
  const waNumber = (phone: string) => {
    let n = (phone || "").replace(/[^\d]/g, "")
    if (n.startsWith("0")) n = "44" + n.slice(1)
    return n
  }
  const shareWhatsApp = async (phone?: string) => {
    const url = await getShareLink()
    if (!url) return
    const msg = `Please review & sign the RAMS for ${rams.survey.title}: ${url}`
    const base = phone ? `https://wa.me/${waNumber(phone)}` : `https://wa.me/`
    window.open(`${base}?text=${encodeURIComponent(msg)}`, "_blank")
  }
  const copyShareLink = async () => {
    const url = await getShareLink()
    if (!url) return
    try { await navigator.clipboard.writeText(url); toast.success("Link copied") }
    catch { toast.error("Copy failed — long-press the link to copy") }
  }

  const sendToOperatives = async () => {
    const withEmail = sections.operatives.filter((o) => /.+@.+\..+/.test(o.email))
    if (withEmail.length === 0) {
      toast.error("Add at least one operative with an email address first")
      return
    }
    if (!confirm(`Email this RAMS to ${withEmail.length} operative${withEmail.length > 1 ? "s" : ""}?`)) return
    setSendingOps(true)
    try {
      const res = await fetch(`/api/rams/${ramsId}/send-operatives`, { method: "POST" })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error)
      toast.success(`Sent to ${data.sent} operative${data.sent > 1 ? "s" : ""}`)
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Couldn't send")
    } finally {
      setSendingOps(false)
    }
  }

  const saveMethod = (next: MethodGroup[]) => { setMethod(next); save({ methodStatement: next }) }
  const setGroupTitle = (gi: number, title: string) =>
    saveMethod(method.map((g, j) => (j === gi ? { ...g, title } : g)))
  const addGroup = () => saveMethod([...method, { title: "", steps: [""] }])
  const rmGroup = (gi: number) => saveMethod(method.filter((_, j) => j !== gi))
  const setStep = (gi: number, si: number, value: string) =>
    saveMethod(method.map((g, j) => (j === gi ? { ...g, steps: g.steps.map((s, k) => (k === si ? value : s)) } : g)))
  const addStep = (gi: number) =>
    saveMethod(method.map((g, j) => (j === gi ? { ...g, steps: [...g.steps, ""] } : g)))
  const rmStep = (gi: number, si: number) =>
    saveMethod(method.map((g, j) => (j === gi ? { ...g, steps: g.steps.filter((_, k) => k !== si) } : g)))

  const downloadPdf = async () => {
    if (!pdfRef.current) return
    setPdfBusy(true)
    try {
      const { exportAndShare } = await import("@/lib/pdf")
      const base = (rams.survey.title || "RAMS").replace(/[^a-z0-9]+/gi, "-").replace(/^-|-$/g, "")
      await exportAndShare(pdfRef.current, `${base || "RAMS"}-RAMS.pdf`, `${rams.survey.title} RAMS`)
    } catch {
      toast.error("Couldn't create the PDF — please try again.")
    } finally {
      setPdfBusy(false)
    }
  }

  const openSend = () => {
    setSendTo(rams?.survey.clientEmail || "")
    setSendMessage("")
    setSendOpen(true)
  }
  const doSend = async () => {
    if (!sendTo.trim()) {
      toast.error("Enter a recipient email")
      return
    }
    setSending(true)
    try {
      const res = await fetch(`/api/rams/${ramsId}/send`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ to: sendTo.trim(), message: sendMessage || undefined }),
      })
      const d = await res.json()
      if (!res.ok) throw new Error(d.error)
      setSendOpen(false)
      toast.success(`RAMS sent to ${sendTo.trim()}`)
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Couldn't send")
    } finally {
      setSending(false)
    }
  }

  const norm = (s: string) => s.trim().toLowerCase()
  const isPreset = (label: string) => PPE_PRESETS.some((p) => norm(p.label) === norm(label))
  const ppeHas = (label: string) => ppe.some((p) => norm(p) === norm(label))
  const togglePpe = (label: string) => {
    const next = ppeHas(label)
      ? ppe.filter((p) => norm(p) !== norm(label))
      : [...ppe.filter((p) => p.trim()), label]
    setPpe(next)
    save({ ppe: next.map((x) => x.trim()).filter(Boolean) })
  }

  const input = "w-full text-sm px-2 py-1.5 border rounded-lg focus:outline-none focus:ring-1 focus:ring-brand-blue"
  const brand = rams.organization.brandColor || "#2563EB"

  // A list section edited as one-item-per-line — matches how these appear in the
  // final RAMS (bulleted lists) while staying quick to edit on mobile. Called as a
  // plain function (not <ListSection/>) so the textarea keeps focus between renders.
  const listSection = (title: string, field: keyof Sections, hint?: string) => {
    const items = (sections[field] as string[]) || []
    return (
      <section className="bg-white rounded-xl shadow-sm p-5">
        <h2 className="font-semibold text-brand-navy mb-1">{title}</h2>
        <p className="no-print text-xs text-gray-400 mb-2">{hint || "One item per line."}</p>
        {/* Bulleted list for print/read */}
        {items.filter((x) => x.trim()).length > 0 && (
          <ul className="hidden print:block list-disc pl-5 text-sm text-gray-700 space-y-0.5">
            {items.filter((x) => x.trim()).map((x, i) => <li key={i}>{x}</li>)}
          </ul>
        )}
        <textarea spellCheck rows={Math.max(3, items.length + 1)} className={`no-print ${input}`}
          value={items.join("\n")}
          onChange={(e) => setSection(field, e.target.value.split("\n") as Sections[typeof field])}
          onBlur={(e) => {
            const cleaned = e.target.value.split("\n").map((x) => x.trim()).filter(Boolean)
            setSection(field, cleaned as Sections[typeof field])
          }} />
      </section>
    )
  }

  return (
    <div className="max-w-3xl mx-auto space-y-5">
      {/* Header */}
      <div className="no-print flex flex-wrap items-center justify-between gap-3">
        <div className="min-w-0">
          <h1 className="text-xl font-bold text-brand-navy truncate">{rams.survey.title} — RAMS</h1>
          <div className="text-xs text-gray-400 flex items-center gap-2">
            <Link href={`/surveys/${rams.survey.id}`} className="inline-flex items-center gap-1 hover:text-brand-blue">
              <ClipboardList className="w-3 h-3" /> Survey
            </Link>
            {rams.survey.proposal && (
              <Link href={`/proposals/${rams.survey.proposal.id}`} className="inline-flex items-center gap-1 hover:text-brand-blue">
                <FileText className="w-3 h-3" /> Proposal
              </Link>
            )}
            <span>
              {saveState === "saving" && "Saving…"}
              {saveState === "saved" && (
                <span className="inline-flex items-center gap-1 text-emerald-600"><Check className="w-3 h-3" /> Saved</span>
              )}
            </span>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <button onClick={regenerate} disabled={regenerating}
            className="inline-flex items-center gap-1.5 px-3 py-2 border rounded-lg text-sm font-medium bg-white hover:bg-gray-50 disabled:opacity-50">
            {regenerating ? <Loader2 className="w-4 h-4 animate-spin" /> : <Sparkles className="w-4 h-4" />}
            Regenerate
          </button>
          <button onClick={downloadPdf} disabled={pdfBusy}
            className="inline-flex items-center gap-1.5 px-3 py-2 border rounded-lg text-sm font-medium bg-white hover:bg-gray-50 disabled:opacity-50">
            {pdfBusy ? <Loader2 className="w-4 h-4 animate-spin" /> : <Printer className="w-4 h-4" />} PDF
          </button>
          <button onClick={openSend}
            className="inline-flex items-center gap-1.5 px-3 py-2 bg-brand-blue text-white rounded-lg text-sm font-semibold hover:bg-blue-700">
            <Send className="w-4 h-4" /> Send to client
          </button>
        </div>
      </div>

      {/* Disclaimer — always visible */}
      <div className="rounded-xl border-2 border-amber-300 bg-amber-50 p-4 flex gap-3">
        <AlertTriangle className="w-5 h-5 text-amber-600 shrink-0 mt-0.5" />
        <p className="text-sm text-amber-800">
          <strong>This is an AI-generated draft to help you think through hazards likely in this type of work.</strong>{" "}
          It is not exhaustive and is not a substitute for your own competent risk assessment. You must review it,
          remove anything that doesn&apos;t apply, and add any other site-specific hazards and controls before use.
        </p>
      </div>

      <div ref={pdfRef} className="print-area space-y-5">
        {/* Document header (company + title) — mainly for the printed PDF */}
        <section className="bg-white rounded-xl shadow-sm p-5" style={{ borderTop: `4px solid ${brand}` }}>
          <div className="flex items-center justify-between gap-3">
            <div className="flex items-center gap-3">
              {rams.organization.logoUrl && (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={rams.organization.logoUrl} alt="" className="h-9 w-auto object-contain" />
              )}
              <div className="font-bold text-brand-navy leading-tight">{rams.organization.name}</div>
            </div>
            <div className="text-right text-[11px] text-gray-400 leading-tight">
              {rams.organization.phone && <div>{rams.organization.phone}</div>}
              {rams.organization.email && <div>{rams.organization.email}</div>}
            </div>
          </div>
          <h2 className="mt-4 text-lg font-bold" style={{ color: brand }}>Risk Assessment &amp; Method Statement (RAMS)</h2>
        </section>

        {/* 1. Company & Job details */}
        <section className="bg-white rounded-xl shadow-sm p-5">
          <h2 className="font-semibold text-brand-navy mb-3">1. Company &amp; job details</h2>
          <div className="text-sm text-gray-600 space-y-1 mb-3">
            <div><span className="text-gray-400">Contractor:</span> {rams.organization.name}</div>
            <div><span className="text-gray-400">Client:</span> {rams.survey.clientName}</div>
            <div>
              <span className="text-gray-400">Site address:</span> {rams.survey.clientAddress}{" "}
              <Link href={`/surveys/${rams.survey.id}?editAddress=1`}
                className="no-print text-brand-blue text-xs font-medium hover:underline">
                Edit
              </Link>
            </div>
          </div>
          <div className="grid sm:grid-cols-2 gap-3">
            <div>
              <label className="block text-[11px] text-gray-400 mb-0.5">Activity</label>
              <input className={input} value={sections.activity}
                onChange={(e) => setSection("activity", e.target.value)} />
            </div>
            <div>
              <label className="block text-[11px] text-gray-400 mb-0.5">Number of operatives</label>
              <input className={input} value={sections.numOperatives}
                onChange={(e) => setSection("numOperatives", e.target.value)} />
            </div>
            <div className="sm:col-span-2">
              <label className="block text-[11px] text-gray-400 mb-0.5">Scope of works</label>
              <textarea spellCheck rows={2} className={input} value={sections.scopeOfWorks}
                onChange={(e) => setSection("scopeOfWorks", e.target.value)} />
            </div>
            <div>
              <label className="block text-[11px] text-gray-400 mb-0.5">Site supervisor / responsible person</label>
              <input className={input} value={sections.siteSupervisor}
                onChange={(e) => setSection("siteSupervisor", e.target.value)} />
            </div>
            <div>
              <label className="block text-[11px] text-gray-400 mb-0.5">Emergency contact(s)</label>
              <input className={input} value={sections.emergencyContacts}
                onChange={(e) => setSection("emergencyContacts", e.target.value)} />
            </div>
            <div className="sm:col-span-2">
              <label className="block text-[11px] text-gray-400 mb-0.5">Nearest A&amp;E / hospital (auto-found from the site address)</label>
              <input className={input} value={sections.nearestHospital}
                onChange={(e) => setSection("nearestHospital", e.target.value)}
                placeholder="Search runs when the RAMS is generated" />
            </div>
            <div className="sm:col-span-2">
              <label className="block text-[11px] text-gray-400 mb-0.5">Access &amp; welfare notes</label>
              <textarea spellCheck rows={2} className={input} value={siteInfo}
                onChange={(e) => { setSiteInfo(e.target.value); save({ siteInfo: e.target.value }) }} />
            </div>
          </div>
        </section>

        {/* 2. Description of works */}
        <section className="bg-white rounded-xl shadow-sm p-5">
          <h2 className="font-semibold text-brand-navy mb-2">2. Description of works</h2>
          <textarea spellCheck rows={4} className={input} value={sections.descriptionOfWorks}
            onChange={(e) => setSection("descriptionOfWorks", e.target.value)} />
        </section>

        {/* 3. Personnel & responsibilities */}
        {listSection("3. Personnel & responsibilities", "responsibilities",
          "Who does what on site — supervisor duties, operative duties, incident reporting. One per line.")}

        {/* 4. Equipment used */}
        {listSection("4. Equipment used", "equipment")}

        {/* 5. PPE required — tap an icon to select/deselect */}
        <section className="bg-white rounded-xl shadow-sm p-5">
          <h2 className="font-semibold text-brand-navy mb-1">5. PPE required</h2>
          <p className="no-print text-xs text-gray-400 mb-3">Tap to select the PPE for this job. Add anything else below.</p>
          <div className="no-print grid grid-cols-2 sm:grid-cols-3 gap-2">
            {PPE_PRESETS.map(({ label, Icon }) => {
              const on = ppeHas(label)
              return (
                <button key={label} type="button" onClick={() => togglePpe(label)}
                  aria-pressed={on}
                  className={`flex items-center gap-2 px-3 py-2 rounded-lg border text-sm text-left transition ${
                    on ? "border-brand-blue bg-blue-50 text-brand-navy font-medium" : "border-gray-200 bg-white text-gray-500 hover:bg-gray-50"
                  }`}>
                  <Icon className="w-5 h-5 shrink-0" />
                  <span className="flex-1">{label}</span>
                  {on && <Check className="w-4 h-4 text-brand-blue shrink-0" />}
                </button>
              )
            })}
          </div>
          {/* Selected PPE — the record that prints in the PDF, as icon chips so the
              icons actually appear (unlike the old emoji, which html2canvas dropped). */}
          {ppe.filter((x) => x.trim()).length > 0 && (
            <div className="hidden print:block mt-3">
              {ppe.filter((x) => x.trim()).map((label, i) => {
                const Icon = ppeIconFor(label)
                return (
                  <span key={i} className="inline-flex items-center gap-1.5 mr-2 mb-2 px-3 py-1.5 rounded-lg border border-gray-300 text-sm text-gray-800 align-top">
                    <Icon className="w-4 h-4 shrink-0" />
                    {label}
                  </span>
                )
              })}
            </div>
          )}
          {/* Custom extras */}
          <label className="no-print block text-[11px] text-gray-400 mt-4 mb-1">Other PPE (one per line)</label>
          <textarea spellCheck rows={2} className={`no-print ${input}`}
            value={ppe.filter((x) => !isPreset(x)).join("\n")}
            onChange={(e) => {
              const extras = e.target.value.split("\n")
              // Keep the selected presets, replace the free-text extras.
              const presets = ppe.filter((x) => isPreset(x))
              const next = [...presets, ...extras]
              setPpe(next)
              save({ ppe: next.map((x) => x.trim()).filter(Boolean) })
            }} />
        </section>

        {/* 6. Hazards & controls */}
        <section className="bg-white rounded-xl shadow-sm p-5">
          <h2 className="font-semibold text-brand-navy mb-1">6. Main hazards &amp; control measures</h2>
          <p className="text-xs text-gray-500 mb-3">
            Each risk is scored <strong>Probability × Severity</strong>. <strong>Pre-control</strong> is the
            risk <em>before</em> your control measures; <strong>Residual</strong> is the risk that remains
            <em> after</em> the controls are applied — this should be lower.
          </p>
          <div className="space-y-3">
            {hazards.map((h, i) => (
              <div key={i} className="border rounded-lg p-3 space-y-2">
                <div className="flex items-start gap-2">
                  <span className="text-xs text-gray-400 mt-2 w-6">6.{i + 1}</span>
                  <div className="flex-1 space-y-2">
                    <div className="grid sm:grid-cols-2 gap-2">
                      <div>
                        <label className="block text-[11px] text-gray-400 mb-0.5">Hazard</label>
                        <textarea spellCheck rows={2} className={input} value={h.hazard} onChange={(e) => setHaz(i, "hazard", e.target.value)} />
                      </div>
                      <div>
                        <label className="block text-[11px] text-gray-400 mb-0.5">Who&apos;s at risk</label>
                        <textarea spellCheck rows={2} className={input} value={h.whoAtRisk} onChange={(e) => setHaz(i, "whoAtRisk", e.target.value)} />
                      </div>
                      <div>
                        <label className="block text-[11px] text-gray-400 mb-0.5">Controls</label>
                        <textarea spellCheck rows={2} className={input} value={h.controls} onChange={(e) => setHaz(i, "controls", e.target.value)} />
                      </div>
                      <div>
                        <label className="block text-[11px] text-gray-400 mb-0.5">PPE</label>
                        <textarea spellCheck rows={2} className={input} value={h.ppe} onChange={(e) => setHaz(i, "ppe", e.target.value)} />
                      </div>
                    </div>
                    {/* Risk scoring: Probability × Severity = Risk Ranking, before and after controls */}
                    <div className="flex flex-wrap items-end gap-x-5 gap-y-2 pt-1">
                      {(["pre", "res"] as const).map((kind) => {
                        const p = kind === "pre" ? (h.preP || 0) : (h.resP || 0)
                        const s = kind === "pre" ? (h.preS || 0) : (h.resS || 0)
                        const rr = p * s
                        const b = rrBand(rr)
                        const sel = "text-xs border rounded px-1.5 py-1 bg-white"
                        return (
                          <div key={kind} className="flex items-end gap-1.5">
                            <div>
                              <label className="block text-[10px] uppercase tracking-wide text-gray-400 mb-0.5">
                                {kind === "pre" ? "Pre-control" : "Residual"}
                              </label>
                              <div className="flex items-center gap-1">
                                <select className={sel} value={p} aria-label={`${kind} probability`}
                                  onChange={(e) => setHazScore(i, kind === "pre" ? "preP" : "resP", Number(e.target.value))}>
                                  <option value={0}>P</option>
                                  {[1, 2, 3, 4, 5].map((n) => <option key={n} value={n}>{n}</option>)}
                                </select>
                                <span className="text-gray-300 text-xs">×</span>
                                <select className={sel} value={s} aria-label={`${kind} severity`}
                                  onChange={(e) => setHazScore(i, kind === "pre" ? "preS" : "resS", Number(e.target.value))}>
                                  <option value={0}>S</option>
                                  {[1, 2, 3, 4, 5].map((n) => <option key={n} value={n}>{n}</option>)}
                                </select>
                              </div>
                            </div>
                            <span className={`inline-block px-2 py-1 rounded-md text-xs font-bold ${b.cls}`}>
                              {rr ? `${rr} · ${b.label}` : "—"}
                            </span>
                          </div>
                        )
                      })}
                    </div>
                  </div>
                  <button onClick={() => rmHaz(i)} className="no-print p-1.5 text-gray-300 hover:text-red-600" aria-label="Remove hazard">
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>
              </div>
            ))}
          </div>
          <button onClick={addHaz} className="no-print mt-3 inline-flex items-center gap-1.5 text-sm text-brand-blue font-medium hover:underline">
            <Plus className="w-4 h-4" /> Add hazard
          </button>

          {/* Risk-ranking key */}
          <div className="mt-5 border-t pt-4 grid sm:grid-cols-3 gap-4 text-xs text-gray-600">
            <div>
              <div className="font-semibold text-brand-navy mb-1">Probability (P)</div>
              <div>1 Highly unlikely · 2 Unlikely · 3 Possible · 4 Probable · 5 Certain</div>
            </div>
            <div>
              <div className="font-semibold text-brand-navy mb-1">Severity (S)</div>
              <div>1 Trivial · 2 Minor injury · 3 Over-3-day injury · 4 Major injury · 5 Incapacity / death</div>
            </div>
            <div>
              <div className="font-semibold text-brand-navy mb-1">Risk ranking (RR = P × S)</div>
              <div className="flex flex-wrap gap-1.5 mt-1">
                <span className="px-2 py-0.5 rounded bg-green-600 text-white font-semibold">1 No action</span>
                <span className="px-2 py-0.5 rounded bg-green-500 text-white font-semibold">2–7 Low</span>
                <span className="px-2 py-0.5 rounded bg-yellow-400 text-gray-900 font-semibold">8–10 Medium</span>
                <span className="px-2 py-0.5 rounded bg-orange-500 text-white font-semibold">11–15 High</span>
                <span className="px-2 py-0.5 rounded bg-red-600 text-white font-semibold">16+ Urgent</span>
              </div>
            </div>
          </div>
        </section>

        {/* 7. Method statement — grouped into phases */}
        <section className="bg-white rounded-xl shadow-sm p-5">
          <h2 className="font-semibold text-brand-navy mb-1">7. Method statement</h2>
          <p className="no-print text-xs text-gray-400 mb-3">The job process in phases — each step is a bullet under its heading.</p>
          <div className="space-y-4">
            {method.map((g, gi) => (
              <div key={gi} className="border rounded-lg p-3">
                <div className="flex items-center gap-2 mb-2">
                  <span className="text-sm font-bold text-brand-navy shrink-0">Step {gi + 1}</span>
                  <input className={`${input} font-semibold`} placeholder="Phase title (e.g. Site setup)"
                    value={g.title} onChange={(e) => setGroupTitle(gi, e.target.value)} />
                  <button onClick={() => rmGroup(gi)} className="no-print p-1.5 text-gray-300 hover:text-red-600" aria-label="Remove phase">
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>
                <ul className="space-y-1.5 pl-1">
                  {g.steps.map((s, si) => (
                    <li key={si} className="flex items-start gap-2">
                      <span className="text-gray-300 mt-2 shrink-0">•</span>
                      <textarea spellCheck rows={1} className={input} value={s} onChange={(e) => setStep(gi, si, e.target.value)} />
                      <button onClick={() => rmStep(gi, si)} className="no-print p-1.5 text-gray-300 hover:text-red-600" aria-label="Remove step">
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </li>
                  ))}
                </ul>
                <button onClick={() => addStep(gi)} className="no-print mt-2 inline-flex items-center gap-1 text-xs text-brand-blue font-medium hover:underline">
                  <Plus className="w-3.5 h-3.5" /> Add step
                </button>
              </div>
            ))}
          </div>
          <button onClick={addGroup} className="no-print mt-3 inline-flex items-center gap-1.5 text-sm text-brand-blue font-medium hover:underline">
            <Plus className="w-4 h-4" /> Add phase
          </button>
        </section>

        {/* 8. Environmental controls */}
        {listSection("8. Environmental controls", "environmentalControls")}

        {/* 9. Emergency procedures */}
        {listSection("9. Emergency procedures", "emergencyProcedures")}

        {/* 10. COSHH / hazardous substances */}
        {listSection("10. COSHH & hazardous substances", "coshh")}

        {/* 10b. Per-chemical COSHH assessments */}
        <section className="bg-white rounded-xl shadow-sm p-5">
          <h2 className="font-semibold text-brand-navy mb-1">10b. COSHH assessments — per chemical</h2>
          <p className="no-print text-xs text-gray-400 mb-3">
            AI-drafted from the chemicals on this job. <strong>Check every assessment against the
            manufacturer&apos;s actual Safety Data Sheet</strong> before relying on it — concentrations and
            hazards vary by product.
          </p>

          {/* SDS prompt + document library */}
          <div className="no-print mb-4 rounded-lg border border-amber-200 bg-amber-50 p-3">
            <p className="text-sm text-amber-800 font-medium flex items-center gap-1.5">
              <FileText className="w-4 h-4 shrink-0" /> Add the SDS for each chemical to your document library
            </p>
            <p className="text-xs text-amber-700 mt-1">
              Operatives (and clients) may ask for them — keep the manufacturer&apos;s Safety Data Sheets on
              file alongside this RAMS.
            </p>
            {documents.length > 0 && (
              <ul className="mt-2 space-y-0.5">
                {documents.map((d) => (
                  <li key={d.id} className="text-xs text-gray-600 truncate">
                    <a href={d.fileUrl} target="_blank" rel="noreferrer" className="hover:underline">📄 {d.name}</a>
                  </li>
                ))}
              </ul>
            )}
            <button onClick={() => sdsInput.current?.click()} disabled={uploadingSds}
              className="mt-2 inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm font-semibold bg-white border border-amber-300 text-amber-800 hover:bg-amber-100 disabled:opacity-50">
              {uploadingSds ? <Loader2 className="w-4 h-4 animate-spin" /> : <Plus className="w-4 h-4" />}
              Upload SDS sheet
            </button>
            <input ref={sdsInput} type="file" accept=".pdf,.doc,.docx,image/*" className="hidden"
              onChange={(e) => uploadSds(e.target.files?.[0])} />
          </div>

          {sections.coshhAssessments.length === 0 && (
            <p className="no-print text-sm text-gray-400 mb-3">
              No chemical assessments yet — add one below, or add the chemicals to the survey and regenerate.
            </p>
          )}
          <div className="space-y-4">
            {sections.coshhAssessments.map((a, i) => (
              <div key={i} className="border rounded-lg p-4">
                <div className="flex items-center gap-2 mb-3">
                  <input className={`${input} font-semibold`} value={a.substance} placeholder="Chemical / product name & concentration"
                    onChange={(e) => setSection("coshhAssessments", sections.coshhAssessments.map((x, xi) => xi === i ? { ...x, substance: e.target.value } : x))} />
                  <button onClick={() => confirm(`Remove the assessment for "${a.substance || "this chemical"}"?`) &&
                      setSection("coshhAssessments", sections.coshhAssessments.filter((_, xi) => xi !== i))}
                    aria-label="Remove chemical" className="no-print p-1.5 text-gray-400 hover:text-red-600">
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>
                <div className="grid sm:grid-cols-2 gap-3">
                  {COSHH_FIELDS.map(({ key, label }) => (
                    <div key={key}>
                      <label className="block text-[11px] text-gray-400 mb-0.5">{label}</label>
                      <textarea spellCheck rows={2} className={input} value={a[key]}
                        onChange={(e) => setSection("coshhAssessments", sections.coshhAssessments.map((x, xi) => xi === i ? { ...x, [key]: e.target.value } : x))} />
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>
          <button onClick={() => setSection("coshhAssessments", [...sections.coshhAssessments, { ...EMPTY_COSHH }])}
            className="no-print mt-3 inline-flex items-center gap-1.5 text-sm font-semibold text-brand-blue hover:underline">
            <Plus className="w-4 h-4" /> Add chemical
          </button>
        </section>

        {/* 11. Competency */}
        {listSection("11. Competency", "competency",
          "Training / competencies operatives must hold. One per line.")}

        {/* Operatives on site */}
        <section className="bg-white rounded-xl shadow-sm p-5">
          <h2 className="font-semibold text-brand-navy mb-1">Operatives on site</h2>
          <p className="no-print text-xs text-gray-400 mb-3">
            Add the people on site, then share the RAMS for them to read and sign. Their signature updates here automatically.
          </p>

          {/* Share actions */}
          <div className="no-print flex flex-wrap gap-2 mb-4">
            <button onClick={() => shareWhatsApp()}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm font-semibold bg-[#25D366] text-white hover:brightness-95">
              <MessageCircle className="w-4 h-4" /> Share on WhatsApp
            </button>
            <button onClick={sendToOperatives} disabled={sendingOps}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm font-semibold bg-brand-blue text-white hover:bg-blue-700 disabled:opacity-50">
              {sendingOps ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
              Email to operatives
            </button>
            <button onClick={copyShareLink}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm font-medium border hover:bg-gray-50">
              <Copy className="w-4 h-4" /> Copy sign link
            </button>
          </div>
          {shareUrl && (
            <div className="no-print flex items-center gap-2 text-xs text-gray-500 mb-4 -mt-1">
              <Link2 className="w-3.5 h-3.5 shrink-0" />
              <span className="truncate">{shareUrl}</span>
            </div>
          )}

          {/* Editable rows */}
          <div className="no-print space-y-3">
            {sections.operatives.map((o, i) => (
              <div key={o.id || i} className="border rounded-lg p-3">
                <div className="grid grid-cols-1 sm:grid-cols-[1fr_1fr_1fr_auto] gap-2 items-center">
                  <input className={input} placeholder="Name" value={o.name}
                    onChange={(e) => setOp(i, "name", e.target.value)} />
                  <input className={input} placeholder="Phone" value={o.phone}
                    onChange={(e) => setOp(i, "phone", e.target.value)} />
                  <input className={input} type="email" placeholder="Email" value={o.email}
                    onChange={(e) => setOp(i, "email", e.target.value)} />
                  <div className="flex items-center gap-1 justify-self-start">
                    {o.phone && (
                      <button onClick={() => shareWhatsApp(o.phone)} className="p-1.5 text-[#25D366] hover:bg-green-50 rounded" aria-label="WhatsApp this operative" title="Send via WhatsApp">
                        <MessageCircle className="w-4 h-4" />
                      </button>
                    )}
                    <button onClick={() => rmOp(i)} className="p-1.5 text-gray-300 hover:text-red-600" aria-label="Remove operative">
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                </div>
                {o.signedAt ? (
                  <div className="flex items-center gap-3 mt-2 pl-0.5">
                    <span className="inline-flex items-center gap-1 text-xs font-medium text-emerald-600">
                      <Check className="w-3.5 h-3.5" /> Signed {new Date(o.signedAt).toLocaleDateString("en-GB")}
                    </span>
                    {o.signatureImage && (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={o.signatureImage} alt="signature" className="h-8 border rounded bg-white" />
                    )}
                  </div>
                ) : (
                  <div className="text-xs text-gray-400 mt-2 pl-0.5">Not yet signed</div>
                )}
              </div>
            ))}
          </div>
          <button onClick={addOp} className="no-print mt-3 inline-flex items-center gap-1.5 text-sm text-brand-blue font-medium hover:underline">
            <Plus className="w-4 h-4" /> Add operative
          </button>

          {/* Sign-off table (prints for wet signatures on site) */}
          <div className="mt-4 overflow-x-auto">
            <table className="w-full text-sm border-collapse">
              <thead>
                <tr className="text-left text-gray-400 border-b">
                  <th className="py-1.5 pr-3 font-medium">Name</th>
                  <th className="py-1.5 pr-3 font-medium">Contact</th>
                  <th className="py-1.5 pr-3 font-medium">Signed</th>
                  <th className="py-1.5 font-medium">Date</th>
                </tr>
              </thead>
              <tbody>
                {(sections.operatives.length ? sections.operatives : [{ name: "", phone: "", email: "" }]).map((o, i) => (
                  <tr key={i} className="border-b border-gray-100">
                    <td className="py-3 pr-3 text-gray-700">{o.name || " "}</td>
                    <td className="py-3 pr-3 text-gray-500">{[o.phone, o.email].filter(Boolean).join(" · ") || " "}</td>
                    <td className="py-3 pr-3"></td>
                    <td className="py-3"></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <p className="text-xs text-gray-500 mt-3">
            By signing, each operative confirms they have read and understood this RAMS and agree to follow the control measures.
          </p>
        </section>

        {/* Approval */}
        <section className="bg-white rounded-xl shadow-sm p-5">
          <h2 className="font-semibold text-brand-navy mb-2">Approval</h2>
          <p className="text-sm text-gray-600">
            This RAMS must be read and understood by all operatives before works commence.
          </p>
          <div className="mt-3 grid sm:grid-cols-2 gap-x-6 gap-y-2 text-sm text-gray-600">
            <div>Prepared by: <span className="text-gray-400">{rams.organization.name}</span></div>
            <div>Client: <span className="text-gray-400">{rams.survey.clientName}</span></div>
            <div>Date: <span className="text-gray-300">________________</span></div>
            <div>Review date: <span className="text-gray-300">________________</span></div>
          </div>
        </section>
      </div>

      {sendOpen && (
        <div className="no-print fixed inset-0 z-50 bg-black/40 flex items-end sm:items-center justify-center p-4"
          onClick={() => !sending && setSendOpen(false)}>
          <div className="bg-white rounded-xl shadow-xl w-full max-w-md p-5 space-y-4" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between">
              <h3 className="font-bold text-brand-navy">Send RAMS to client</h3>
              <button onClick={() => setSendOpen(false)} disabled={sending} aria-label="Close"
                className="p-1 text-gray-400 hover:text-gray-600"><X className="w-4 h-4" /></button>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">To</label>
              <input type="text" inputMode="email" value={sendTo} onChange={(e) => setSendTo(e.target.value)}
                placeholder="client@email.com, partner@email.com"
                className="w-full px-3 py-2 border rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-brand-blue" />
              <p className="text-xs text-gray-400 mt-1">Sending to more than one person? Separate each email with a comma.</p>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Message (optional)</label>
              <textarea spellCheck rows={3} value={sendMessage} onChange={(e) => setSendMessage(e.target.value)}
                placeholder="A short personal note…"
                className="w-full px-3 py-2 border rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-brand-blue" />
            </div>
            <p className="text-xs text-gray-400">The client gets a link to a clean, read-only version of this RAMS (no operative sign-off section).</p>
            <div className="flex justify-end gap-2 pt-1">
              <button onClick={() => setSendOpen(false)} disabled={sending}
                className="px-4 py-2 border rounded-lg text-sm font-medium hover:bg-gray-50">Cancel</button>
              <button onClick={doSend} disabled={sending}
                className="inline-flex items-center gap-2 px-4 py-2 bg-brand-blue text-white rounded-lg text-sm font-semibold hover:bg-blue-700 disabled:opacity-50">
                {sending ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />} Send
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
