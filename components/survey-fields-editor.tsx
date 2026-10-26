"use client"

import { useEffect, useState } from "react"
import { toast } from "sonner"
import { Loader2, Plus, Trash2, RotateCcw } from "lucide-react"
import { TRADE_PRESETS, presetFor, parseSurveyFields, type SurveyFieldDef } from "@/lib/survey-fields"

// Settings → Survey questions: pick the firm's trade (seeds the preset) and
// customise the trade-specific questions surveyors answer on every job.
export function SurveyFieldsEditor() {
  const [trade, setTrade] = useState<string>("exterior-cleaning")
  const [fields, setFields] = useState<SurveyFieldDef[] | null>(null)
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    fetch("/api/organization")
      .then((r) => r.json())
      .then((org) => {
        setTrade(org?.trade || "exterior-cleaning")
        setFields(parseSurveyFields(org || {}))
      })
      .catch(() => setFields(parseSurveyFields({})))
  }, [])

  const save = async (nextTrade: string, nextFields: SurveyFieldDef[] | null) => {
    setSaving(true)
    try {
      const res = await fetch("/api/organization", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          trade: nextTrade,
          surveyFields: nextFields ? JSON.stringify(nextFields.filter((f) => f.label.trim())) : "",
        }),
      })
      if (!res.ok) throw new Error((await res.json()).error)
      toast.success("Survey questions saved")
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Couldn't save")
    } finally {
      setSaving(false)
    }
  }

  if (!fields) {
    return <div className="flex items-center gap-2 text-sm text-gray-400"><Loader2 className="w-4 h-4 animate-spin" /> Loading…</div>
  }

  const update = (i: number, patch: Partial<SurveyFieldDef>) =>
    setFields((f) => f && f.map((x, j) => (j === i ? { ...x, ...patch } : x)))

  const switchTrade = (t: string) => {
    setTrade(t)
    const next = presetFor(t).fields
    setFields(next)
    save(t, null) // null = use the preset until they customise
  }

  return (
    <div className="space-y-4">
      <div>
        <label className="block text-sm font-medium text-gray-600 mb-1">Your trade</label>
        <select value={trade} onChange={(e) => switchTrade(e.target.value)}
          className="w-full sm:w-72 border rounded-lg px-3 py-2 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-brand-blue/30">
          {TRADE_PRESETS.map((t) => <option key={t.id} value={t.id}>{t.label}</option>)}
        </select>
        <p className="text-xs text-gray-400 mt-1">
          Switching trade resets the questions below to that trade&apos;s starting set.
        </p>
      </div>

      <div className="space-y-2">
        <p className="text-sm font-medium text-gray-700">Trade-specific survey questions</p>
        <p className="text-xs text-gray-500">
          Asked on every survey, alongside the standard ones (priorities, access, measurements,
          exclusions). Answers feed the AI-drafted proposal. &ldquo;On proposal&rdquo; marks an answer
          as client-facing.
        </p>
        {fields.map((f, i) => (
          <div key={f.id} className="border rounded-lg p-3 space-y-2 bg-gray-50/50">
            <div className="flex items-center gap-2">
              <input value={f.label} onChange={(e) => update(i, { label: e.target.value })}
                placeholder="Question label"
                className="flex-1 text-sm font-medium px-3 py-1.5 border rounded-lg bg-white focus:outline-none focus:ring-2 focus:ring-brand-blue/30" />
              <label className="flex items-center gap-1.5 text-xs text-gray-500 whitespace-nowrap cursor-pointer select-none">
                <input type="checkbox" checked={!!f.showOnProposal}
                  onChange={(e) => update(i, { showOnProposal: e.target.checked })}
                  className="rounded accent-blue-600" />
                On proposal
              </label>
              <button type="button" aria-label={`Remove ${f.label}`}
                onClick={() => setFields((x) => x && x.filter((_, j) => j !== i))}
                className="p-1.5 text-gray-400 hover:text-red-600 shrink-0">
                <Trash2 className="w-4 h-4" />
              </button>
            </div>
            <input value={f.hint || ""} onChange={(e) => update(i, { hint: e.target.value })}
              placeholder="Hint shown to the surveyor (optional)"
              className="w-full text-xs px-3 py-1.5 border rounded-lg bg-white text-gray-600 focus:outline-none focus:ring-2 focus:ring-brand-blue/30" />
            {f.legacyKey && (
              <p className="text-[11px] text-amber-600">
                Feeds RAMS/COSHH {f.legacyKey === "chemicalsRequired" ? "chemical assessments" : "water planning"} — keep if you produce RAMS.
              </p>
            )}
          </div>
        ))}
        <div className="flex flex-wrap items-center gap-2">
          <button type="button"
            onClick={() => setFields((f) => f && [...f, { id: `f-${Date.now()}`, label: "", hint: "" }])}
            className="inline-flex items-center gap-1.5 px-3 py-2 border rounded-lg text-sm font-medium text-gray-600 hover:border-brand-blue hover:text-brand-blue">
            <Plus className="w-4 h-4" /> Add a question
          </button>
          <button type="button" onClick={() => { setFields(presetFor(trade).fields); toast.message("Reset to the trade's defaults — Save to keep") }}
            className="inline-flex items-center gap-1.5 px-3 py-2 border rounded-lg text-sm font-medium text-gray-600 hover:border-gray-400">
            <RotateCcw className="w-4 h-4" /> Reset to defaults
          </button>
          <button type="button" onClick={() => fields && save(trade, fields)} disabled={saving}
            className="inline-flex items-center gap-2 px-4 py-2 bg-brand-navy text-white rounded-lg text-sm font-semibold hover:opacity-90 disabled:opacity-50">
            {saving && <Loader2 className="w-4 h-4 animate-spin" />} Save questions
          </button>
        </div>
      </div>
    </div>
  )
}
