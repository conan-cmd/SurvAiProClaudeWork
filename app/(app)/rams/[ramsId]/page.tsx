"use client"

import { useEffect, useRef, useState } from "react"
import { useParams } from "next/navigation"
import Link from "next/link"
import { toast } from "sonner"
import {
  Loader2, Sparkles, Plus, Trash2, Printer, ClipboardList, FileText,
  AlertTriangle, Check,
} from "lucide-react"

type Hazard = { hazard: string; whoAtRisk: string; controls: string; ppe: string }
type Rams = {
  id: string
  hazards: string | null
  methodStatement: string | null
  ppe: string | null
  siteInfo: string | null
  survey: {
    id: string
    title: string
    clientName: string
    clientAddress: string
    serviceType: string
    proposal: { id: string } | null
  }
  organization: { name: string; logoUrl: string | null; brandColor: string; phone: string | null; email: string | null }
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
  const [method, setMethod] = useState<string[]>([])
  const [ppe, setPpe] = useState<string[]>([])
  const [siteInfo, setSiteInfo] = useState("")
  const [saveState, setSaveState] = useState<"idle" | "saving" | "saved">("idle")
  const [regenerating, setRegenerating] = useState(false)
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null)

  useEffect(() => {
    fetch(`/api/rams/${ramsId}`)
      .then((r) => {
        if (!r.ok) throw new Error()
        return r.json()
      })
      .then((d: Rams) => {
        setRams(d)
        setHazards(parse<Hazard[]>(d.hazards, []))
        setMethod(parse<string[]>(d.methodStatement, []))
        setPpe(parse<string[]>(d.ppe, []))
        setSiteInfo(d.siteInfo || "")
      })
      .catch(() => toast.error("Failed to load RAMS"))
  }, [ramsId])

  const save = (patch: Record<string, unknown>) => {
    setSaveState("saving")
    if (timer.current) clearTimeout(timer.current)
    timer.current = setTimeout(async () => {
      const res = await fetch(`/api/rams/${ramsId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(patch),
      })
      setSaveState(res.ok ? "saved" : "idle")
    }, 700)
  }

  const regenerate = async () => {
    if (!rams) return
    if (!confirm("Regenerate the draft? This replaces the current hazards and method statement.")) return
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
  const setStep = (i: number, value: string) => {
    const next = method.map((s, j) => (j === i ? value : s))
    setMethod(next)
    save({ methodStatement: next })
  }
  const addStep = () => {
    const next = [...method, ""]
    setMethod(next)
    save({ methodStatement: next })
  }
  const rmStep = (i: number) => {
    const next = method.filter((_, j) => j !== i)
    setMethod(next)
    save({ methodStatement: next })
  }

  const input = "w-full text-sm px-2 py-1.5 border rounded-lg focus:outline-none focus:ring-1 focus:ring-brand-blue"

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
          <button onClick={() => window.print()}
            className="inline-flex items-center gap-1.5 px-3 py-2 border rounded-lg text-sm font-medium bg-white hover:bg-gray-50">
            <Printer className="w-4 h-4" /> PDF
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

      <div className="print-area space-y-5">
        {/* Site details */}
        <section className="bg-white rounded-xl shadow-sm p-5">
          <h2 className="font-semibold text-brand-navy mb-3">Site &amp; task</h2>
          <div className="text-sm text-gray-600 space-y-1">
            <div><span className="text-gray-400">Task:</span> {rams.survey.serviceType} — {rams.survey.title}</div>
            <div><span className="text-gray-400">Client:</span> {rams.survey.clientName}</div>
            <div><span className="text-gray-400">Site:</span> {rams.survey.clientAddress}</div>
          </div>
          <label className="block text-xs font-medium text-gray-500 mt-3 mb-1">Site info (access, welfare, emergency)</label>
          <textarea rows={3} className={input} value={siteInfo}
            onChange={(e) => { setSiteInfo(e.target.value); save({ siteInfo: e.target.value }) }} />
        </section>

        {/* Hazards */}
        <section className="bg-white rounded-xl shadow-sm p-5">
          <h2 className="font-semibold text-brand-navy mb-3">Hazards &amp; controls</h2>
          <div className="space-y-3">
            {hazards.map((h, i) => (
              <div key={i} className="border rounded-lg p-3 space-y-2">
                <div className="flex items-start gap-2">
                  <span className="text-xs text-gray-400 mt-2 w-5">{i + 1}.</span>
                  <div className="flex-1 grid sm:grid-cols-2 gap-2">
                    <div>
                      <label className="block text-[11px] text-gray-400 mb-0.5">Hazard</label>
                      <textarea rows={2} className={input} value={h.hazard} onChange={(e) => setHaz(i, "hazard", e.target.value)} />
                    </div>
                    <div>
                      <label className="block text-[11px] text-gray-400 mb-0.5">Who&apos;s at risk</label>
                      <textarea rows={2} className={input} value={h.whoAtRisk} onChange={(e) => setHaz(i, "whoAtRisk", e.target.value)} />
                    </div>
                    <div>
                      <label className="block text-[11px] text-gray-400 mb-0.5">Controls</label>
                      <textarea rows={2} className={input} value={h.controls} onChange={(e) => setHaz(i, "controls", e.target.value)} />
                    </div>
                    <div>
                      <label className="block text-[11px] text-gray-400 mb-0.5">PPE</label>
                      <textarea rows={2} className={input} value={h.ppe} onChange={(e) => setHaz(i, "ppe", e.target.value)} />
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
        </section>

        {/* Method statement */}
        <section className="bg-white rounded-xl shadow-sm p-5">
          <h2 className="font-semibold text-brand-navy mb-1">Method statement</h2>
          <p className="text-xs text-gray-400 mb-3">The job process, step by step.</p>
          <ol className="space-y-2">
            {method.map((s, i) => (
              <li key={i} className="flex items-start gap-2">
                <span className="text-sm font-semibold text-brand-navy mt-1.5 w-6 shrink-0">{i + 1}.</span>
                <textarea rows={2} className={input} value={s} onChange={(e) => setStep(i, e.target.value)} />
                <button onClick={() => rmStep(i)} className="no-print p-1.5 text-gray-300 hover:text-red-600" aria-label="Remove step">
                  <Trash2 className="w-4 h-4" />
                </button>
              </li>
            ))}
          </ol>
          <button onClick={addStep} className="no-print mt-3 inline-flex items-center gap-1.5 text-sm text-brand-blue font-medium hover:underline">
            <Plus className="w-4 h-4" /> Add step
          </button>
        </section>

        {/* PPE summary */}
        <section className="bg-white rounded-xl shadow-sm p-5">
          <h2 className="font-semibold text-brand-navy mb-1">PPE required</h2>
          <p className="text-xs text-gray-400 mb-2">One item per line.</p>
          <textarea rows={4} className={input} value={ppe.join("\n")}
            onChange={(e) => {
              const next = e.target.value.split("\n").map((x) => x.trim()).filter(Boolean)
              setPpe(e.target.value.split("\n") as string[])
              save({ ppe: next })
            }} />
        </section>
      </div>
    </div>
  )
}
