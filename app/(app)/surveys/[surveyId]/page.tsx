"use client"

import { useCallback, useEffect, useRef, useState } from "react"
import { useParams, useRouter } from "next/navigation"
import { toast } from "sonner"
import { Loader2, Sparkles, FileText, Check } from "lucide-react"
import { PhotoManager, Photo } from "@/components/photo-manager"
import { VoiceNotes, VoiceNoteWithTranscript } from "@/components/voice-notes"

type Survey = {
  id: string
  clientName: string
  clientCompany: string | null
  clientEmail: string | null
  clientPhone: string | null
  clientAddress: string
  title: string
  serviceType: string
  isResidential: boolean
  clientPriorities: string | null
  accessNotes: string | null
  measurements: string | null
  exclusions: string | null
  writtenDescription: string | null
  photos: Photo[]
  voiceNotes: VoiceNoteWithTranscript[]
  proposal: { id: string; status: string } | null
}

const TEMPLATES = [
  {
    id: "QUICK_QUOTE",
    name: "Quick Quote",
    desc: "Cover, scope, photos, pricing. Fast and simple.",
  },
  {
    id: "CONSULTATIVE",
    name: "Consultative",
    desc: "Adds problem, solution and next steps. Good for comparisons.",
  },
  {
    id: "AUTHORITY",
    name: "Authority",
    desc: "Full credibility build with About Us and methodology. Best for high-value work.",
  },
] as const

function recommend(survey: Survey): string {
  if (!survey.isResidential) return "AUTHORITY"
  if ((survey.writtenDescription || "").length > 600) return "CONSULTATIVE"
  return "QUICK_QUOTE"
}

export default function SurveyDetailPage() {
  const { surveyId } = useParams<{ surveyId: string }>()
  const router = useRouter()
  const [survey, setSurvey] = useState<Survey | null>(null)
  const [saveState, setSaveState] = useState<"idle" | "saving" | "saved">("idle")
  const [generating, setGenerating] = useState(false)
  const [template, setTemplate] = useState<string | null>(null)
  const saveTimeout = useRef<ReturnType<typeof setTimeout> | null>(null)

  useEffect(() => {
    fetch(`/api/surveys/${surveyId}`)
      .then((r) => {
        if (!r.ok) throw new Error()
        return r.json()
      })
      .then((data: Survey) => {
        setSurvey(data)
        setTemplate(recommend(data))
      })
      .catch(() => toast.error("Failed to load survey"))
  }, [surveyId])

  // Debounced autosave for text fields
  const updateField = useCallback(
    (field: string, value: string | boolean) => {
      setSurvey((prev) => (prev ? { ...prev, [field]: value } : prev))
      setSaveState("saving")
      if (saveTimeout.current) clearTimeout(saveTimeout.current)
      saveTimeout.current = setTimeout(async () => {
        const res = await fetch(`/api/surveys/${surveyId}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ [field]: value }),
        })
        setSaveState(res.ok ? "saved" : "idle")
        if (!res.ok) toast.error("Autosave failed — check your connection")
      }, 800)
    },
    [surveyId]
  )

  const generateProposal = async () => {
    if (!survey || !template) return
    const unapproved = survey.voiceNotes.filter(
      (n) => n.transcript && !n.transcript.approved
    )
    if (unapproved.length) {
      toast.error("Please review and approve your transcripts first")
      return
    }
    setGenerating(true)
    try {
      const res = await fetch("/api/proposals", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ surveyId: survey.id, templateId: template }),
      })
      const data = await res.json()
      if (res.status === 409 && data.proposalId) {
        router.push(`/proposals/${data.proposalId}`)
        return
      }
      if (!res.ok) throw new Error(data.error || "Generation failed")
      toast.success("Proposal draft ready — review every section before sending")
      router.push(`/proposals/${data.id}`)
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Generation failed")
    } finally {
      setGenerating(false)
    }
  }

  if (!survey) {
    return (
      <div className="flex justify-center py-20">
        <Loader2 className="w-8 h-8 animate-spin text-brand-blue" />
      </div>
    )
  }

  const recommended = recommend(survey)
  const inputCls =
    "w-full px-4 py-2.5 border rounded-lg focus:outline-none focus:ring-2 focus:ring-brand-blue text-base"
  const labelCls = "block text-sm font-medium text-gray-700 mb-1"

  return (
    <div className="max-w-2xl mx-auto space-y-6">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-brand-navy">{survey.title}</h1>
          <p className="text-gray-500 text-sm">
            {survey.clientName} · {survey.clientAddress}
          </p>
        </div>
        <span className="text-xs text-gray-400 whitespace-nowrap pt-2">
          {saveState === "saving" && "Saving…"}
          {saveState === "saved" && (
            <span className="inline-flex items-center gap-1 text-emerald-600">
              <Check className="w-3 h-3" /> Saved
            </span>
          )}
        </span>
      </div>

      {survey.proposal && (
        <button
          onClick={() => router.push(`/proposals/${survey.proposal!.id}`)}
          className="w-full flex items-center justify-center gap-2 py-3 bg-blue-50 border border-blue-200 text-brand-blue rounded-xl font-semibold hover:bg-blue-100"
        >
          <FileText className="w-4 h-4" /> Open proposal ({survey.proposal.status})
        </button>
      )}

      {/* Survey notes */}
      <section className="bg-white rounded-xl shadow-sm p-5 space-y-4">
        <h2 className="font-semibold text-brand-navy">Survey notes</h2>
        <div>
          <label className={labelCls}>Written description</label>
          <textarea rows={4} className={inputCls} value={survey.writtenDescription || ""}
            onChange={(e) => updateField("writtenDescription", e.target.value)} />
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div>
            <label className={labelCls}>Client priorities</label>
            <textarea rows={2} className={inputCls} value={survey.clientPriorities || ""}
              onChange={(e) => updateField("clientPriorities", e.target.value)} />
          </div>
          <div>
            <label className={labelCls}>Access notes</label>
            <textarea rows={2} className={inputCls} value={survey.accessNotes || ""}
              onChange={(e) => updateField("accessNotes", e.target.value)} />
          </div>
          <div>
            <label className={labelCls}>Measurements</label>
            <textarea rows={2} className={inputCls} value={survey.measurements || ""}
              onChange={(e) => updateField("measurements", e.target.value)} />
          </div>
          <div>
            <label className={labelCls}>Exclusions</label>
            <textarea rows={2} className={inputCls} value={survey.exclusions || ""}
              onChange={(e) => updateField("exclusions", e.target.value)} />
          </div>
        </div>
      </section>

      {/* Photos */}
      <section className="bg-white rounded-xl shadow-sm p-5">
        <h2 className="font-semibold text-brand-navy mb-4">
          Photos <span className="text-gray-400 font-normal">({survey.photos.length})</span>
        </h2>
        <PhotoManager
          surveyId={survey.id}
          photos={survey.photos}
          onChange={(photos) => setSurvey((s) => (s ? { ...s, photos } : s))}
        />
      </section>

      {/* Voice notes */}
      <section className="bg-white rounded-xl shadow-sm p-5">
        <h2 className="font-semibold text-brand-navy mb-4">Voice notes</h2>
        <VoiceNotes
          surveyId={survey.id}
          voiceNotes={survey.voiceNotes}
          onChange={(voiceNotes) => setSurvey((s) => (s ? { ...s, voiceNotes } : s))}
        />
      </section>

      {/* Template + generate */}
      {!survey.proposal && (
        <section className="bg-white rounded-xl shadow-sm p-5 space-y-4">
          <h2 className="font-semibold text-brand-navy">Choose a proposal style</h2>
          <div className="space-y-2">
            {TEMPLATES.map((t) => (
              <button key={t.id} type="button" onClick={() => setTemplate(t.id)}
                className={`w-full text-left p-4 rounded-xl border-2 transition ${
                  template === t.id
                    ? "border-brand-blue bg-blue-50"
                    : "border-gray-200 hover:border-gray-300"
                }`}>
                <div className="flex items-center justify-between">
                  <span className="font-semibold text-brand-navy">{t.name}</span>
                  {recommended === t.id && (
                    <span className="text-xs font-semibold text-brand-green bg-emerald-50 border border-emerald-200 px-2 py-0.5 rounded-full">
                      Recommended
                    </span>
                  )}
                </div>
                <p className="text-sm text-gray-500 mt-1">{t.desc}</p>
              </button>
            ))}
          </div>

          <button onClick={generateProposal} disabled={generating}
            className="w-full inline-flex items-center justify-center gap-2 py-3.5 bg-brand-blue text-white rounded-xl font-bold text-lg hover:bg-blue-700 transition disabled:opacity-60">
            {generating ? (
              <>
                <Loader2 className="w-5 h-5 animate-spin" /> Writing your proposal…
              </>
            ) : (
              <>
                <Sparkles className="w-5 h-5" /> Generate proposal
              </>
            )}
          </button>
          <p className="text-xs text-gray-400 text-center">
            AI writes a draft from your survey. You review and edit everything before it goes anywhere.
          </p>
        </section>
      )}
    </div>
  )
}
