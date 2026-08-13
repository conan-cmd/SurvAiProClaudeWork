"use client"

import { useCallback, useEffect, useRef, useState } from "react"
import { useParams, useRouter } from "next/navigation"
import { toast } from "sonner"
import { Loader2, Sparkles, FileText, Check, Pencil } from "lucide-react"
import { RamsButton } from "@/components/rams-button"
import { PhotoManager, Photo } from "@/components/photo-manager"
import { VoiceNotes, VoiceNoteWithTranscript } from "@/components/voice-notes"
import { DictateButton } from "@/components/dictate-button"
import { SiteLocation } from "@/components/site-location"
import { AreaMeasure } from "@/components/area-measure"
import { SiteMap } from "@/components/site-map"
import { SiteAddress, LocationUpdate } from "@/components/site-address"

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
  chemicalsRequired: string | null
  waterSupply: string | null
  writtenDescription: string | null
  latitude: number | null
  longitude: number | null
  what3words: string | null
  streetViewHeading: number | null
  aerialZoom: number | null
  areaPolygon: string | null
  areaSqm: number | null
  mapMeasurements: string | null
  linearMeters: number | null
  showMeasurementsOnProposal: boolean
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

// Defined at module scope (not inside the page) so it's a stable component type —
// otherwise every re-render would remount the Dictate button and kill an in-progress
// recording when you tap any other control.
function FieldLabel({ label, onText }: { label: string; onText: (text: string) => void }) {
  return (
    <div className="flex items-center justify-between mb-1">
      <span className="text-sm font-medium text-gray-700">{label}</span>
      <DictateButton onText={onText} />
    </div>
  )
}

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
  const [organising, setOrganising] = useState(false)
  const [template, setTemplate] = useState<string | null>(null)
  const saveTimeout = useRef<ReturnType<typeof setTimeout> | null>(null)
  // Bumping this pops the Site location address editor open (header click,
  // or arriving with ?editAddress=1 — e.g. straight after duplicating a job).
  const [addressEditSignal, setAddressEditSignal] = useState(0)

  const editAddress = () => {
    setAddressEditSignal((n) => n + 1)
    document.getElementById("site-location")?.scrollIntoView({ behavior: "smooth", block: "start" })
  }

  useEffect(() => {
    fetch(`/api/surveys/${surveyId}`)
      .then((r) => {
        if (!r.ok) throw new Error()
        return r.json()
      })
      .then((data: Survey) => {
        setSurvey(data)
        setTemplate(recommend(data))
        if (new URLSearchParams(window.location.search).get("editAddress")) {
          window.history.replaceState({}, "", `/surveys/${surveyId}`)
          setAddressEditSignal((n) => n + 1)
          setTimeout(() => document.getElementById("site-location")?.scrollIntoView({ behavior: "smooth", block: "start" }), 150)
        }
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

  // "Say it once" — AI splits the written description (+ voice notes) into the
  // structured survey fields, which stay fully editable.
  const organiseNotes = async () => {
    if (!survey) return
    setOrganising(true)
    try {
      const res = await fetch(`/api/surveys/${survey.id}/organise-notes`, { method: "POST" })
      const d = await res.json()
      if (!res.ok) throw new Error(d.error)
      setSurvey((s) => (s ? { ...s, ...d } : s))
      toast.success("Organised into sections — review & tweak below")
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Couldn't organise the notes")
    } finally {
      setOrganising(false)
    }
  }

  // Appends dictated speech to a field's current value
  const dictateInto = (field: keyof Survey) => (text: string) =>
    updateField(field, (((survey[field] as string) || "") + " " + text).trim())

  return (
    <div className="max-w-2xl mx-auto space-y-6">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          <input
            value={survey.title}
            onChange={(e) => updateField("title", e.target.value)}
            aria-label="Survey title"
            className="text-2xl font-bold text-brand-navy bg-transparent w-full border-b border-transparent hover:border-gray-300 focus:border-brand-blue focus:outline-none"
          />
          <p className="text-gray-500 text-sm mt-0.5">
            {survey.clientName} ·{" "}
            <button type="button" onClick={editAddress}
              title="Edit the site address"
              className="text-left hover:text-brand-blue hover:underline underline-offset-2">
              {survey.clientAddress || "Add address"} <Pencil className="w-3 h-3 inline-block align-baseline" />
            </button>
          </p>
          {survey.latitude != null && survey.longitude != null && (
            <p className="text-xs text-gray-400 mt-0.5">
              <span className="text-gray-500">GPS:</span> {survey.latitude.toFixed(5)}, {survey.longitude.toFixed(5)}
              {survey.what3words ? <> · <span className="text-gray-500">what3words:</span> ///{survey.what3words}</> : ""}
            </p>
          )}
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

      <div className={`grid gap-2 ${survey.proposal ? "grid-cols-1 sm:grid-cols-2" : "grid-cols-1"}`}>
        {survey.proposal && (
          <button
            onClick={() => router.push(`/proposals/${survey.proposal!.id}`)}
            className="w-full flex items-center justify-center gap-2 py-3 bg-blue-50 border border-blue-200 text-brand-blue rounded-xl font-semibold hover:bg-blue-100"
          >
            <FileText className="w-4 h-4" /> Open proposal ({survey.proposal.status})
          </button>
        )}
        {/* RAMS straight from the survey — no proposal needed. Opens the existing
            RAMS if one was already drafted for this job. */}
        <RamsButton surveyId={survey.id}
          className="w-full flex items-center justify-center gap-2 py-3 bg-amber-50 border border-amber-200 text-amber-700 rounded-xl font-semibold hover:bg-amber-100" />
      </div>

      {/* Survey notes */}
      <section className="bg-white rounded-xl shadow-sm p-5 space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h2 className="font-semibold text-brand-navy">Survey notes</h2>
          <button onClick={organiseNotes} disabled={organising}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-blue-50 border border-blue-200 text-brand-blue rounded-lg text-sm font-semibold hover:bg-blue-100 disabled:opacity-50">
            {organising ? <Loader2 className="w-4 h-4 animate-spin" /> : <Sparkles className="w-4 h-4" />}
            Organise into sections
          </button>
        </div>
        <div>
          <FieldLabel label="Describe the whole job (type or dictate)" onText={dictateInto("writtenDescription")} />
          <textarea spellCheck rows={4} className={inputCls} value={survey.writtenDescription || ""}
            placeholder="Just describe everything about the job here — sizes, what's included/excluded, access, what the client wants. Then tap 'Organise into sections' and AI sorts it out."
            onChange={(e) => updateField("writtenDescription", e.target.value)} />
          <p className="text-xs text-gray-400 mt-1">Say it once — AI fills the fields below, which you can then tweak.</p>
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div>
            <FieldLabel label="Client priorities" onText={dictateInto("clientPriorities")} />
            <textarea spellCheck rows={2} className={inputCls} value={survey.clientPriorities || ""}
              onChange={(e) => updateField("clientPriorities", e.target.value)} />
          </div>
          <div>
            <FieldLabel label="Access notes" onText={dictateInto("accessNotes")} />
            <textarea spellCheck rows={2} className={inputCls} value={survey.accessNotes || ""}
              onChange={(e) => updateField("accessNotes", e.target.value)} />
          </div>
          <div>
            <FieldLabel label="Measurements" onText={dictateInto("measurements")} />
            <textarea spellCheck rows={2} className={inputCls} value={survey.measurements || ""}
              onChange={(e) => updateField("measurements", e.target.value)} />
          </div>
          <div>
            <FieldLabel label="Exclusions" onText={dictateInto("exclusions")} />
            <textarea spellCheck rows={2} className={inputCls} value={survey.exclusions || ""}
              onChange={(e) => updateField("exclusions", e.target.value)} />
          </div>
          <div>
            <FieldLabel label="Chemicals required" onText={dictateInto("chemicalsRequired")} />
            <textarea spellCheck rows={2} className={inputCls} value={survey.chemicalsRequired || ""}
              placeholder="e.g. sodium hypochlorite 5%, biocide, softwash mix"
              onChange={(e) => updateField("chemicalsRequired", e.target.value)} />
          </div>
          <div>
            <FieldLabel label="Water supply" onText={dictateInto("waterSupply")} />
            <textarea spellCheck rows={2} className={inputCls} value={survey.waterSupply || ""}
              placeholder="e.g. outside tap on-site / bring bowser / low pressure"
              onChange={(e) => updateField("waterSupply", e.target.value)} />
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

      {/* Site address, location, imagery & measurements */}
      {(() => {
        const hasCoords = survey.latitude != null && survey.longitude != null
        const onPhotosChange = (photos: Survey["photos"]) => setSurvey((s) => (s ? { ...s, photos } : s))
        const onLocationUpdated = (data: LocationUpdate) =>
          setSurvey((s) =>
            s
              ? {
                  ...s,
                  clientAddress: data.clientAddress,
                  latitude: data.latitude,
                  longitude: data.longitude,
                  what3words: data.what3words,
                  photos: data.photos,
                  // Fresh location — old fine-tuning no longer applies.
                  streetViewHeading: null,
                  aerialZoom: null,
                }
              : s
          )
        const savedMeasurements = (() => {
          try {
            if (survey.mapMeasurements) return JSON.parse(survey.mapMeasurements)
            // Back-compat: seed from the old single-polygon area.
            if (survey.areaPolygon) return [{ id: "legacy", type: "area", points: JSON.parse(survey.areaPolygon) }]
            return null
          } catch { return null }
        })()

        return (
          <section id="site-location" className="bg-white rounded-xl shadow-sm p-5 space-y-4 scroll-mt-16">
            <h2 className="font-semibold text-brand-navy">Site location</h2>
            <SiteAddress
              surveyId={survey.id}
              address={survey.clientAddress}
              hasCoords={hasCoords}
              onUpdated={onLocationUpdated}
              openSignal={addressEditSignal}
            />

            {hasCoords && (
              // Interactive Google-Earth-style aerial when the browser Maps key is set;
              // otherwise fall back to the static location + measure components. Keyed on
              // the coordinates so a corrected location cleanly recentres the map.
              process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY ? (
                <div key={`${survey.latitude},${survey.longitude}`}>
                  <div className="text-sm font-medium text-gray-600 mb-2">
                    Site map{survey.areaSqm ? ` — ${Math.round(survey.areaSqm).toLocaleString()} m²` : ""}{survey.linearMeters ? ` · ${Math.round(survey.linearMeters).toLocaleString()} m` : ""}
                  </div>
                  <SiteMap
                    surveyId={survey.id}
                    latitude={survey.latitude!}
                    longitude={survey.longitude!}
                    savedMeasurements={savedMeasurements}
                    savedShowOnProposal={survey.showMeasurementsOnProposal}
                    onPhotosChange={onPhotosChange}
                  />
                </div>
              ) : (
                <div key={`${survey.latitude},${survey.longitude}`} className="space-y-4">
                  <SiteLocation
                    surveyId={survey.id}
                    latitude={survey.latitude}
                    longitude={survey.longitude}
                    savedHeading={survey.streetViewHeading}
                    savedZoom={survey.aerialZoom}
                    onPhotosChange={onPhotosChange}
                  />
                  <div>
                    <div className="text-sm font-medium text-gray-600 mb-2">
                      Measure &amp; annotate{survey.areaSqm ? ` — ${Math.round(survey.areaSqm).toLocaleString()} m²` : ""}{survey.linearMeters ? ` · ${Math.round(survey.linearMeters).toLocaleString()} m` : ""}
                    </div>
                    <AreaMeasure
                      surveyId={survey.id}
                      latitude={survey.latitude}
                      longitude={survey.longitude}
                      savedZoom={survey.aerialZoom}
                      savedMeasurements={savedMeasurements}
                      savedShowOnProposal={survey.showMeasurementsOnProposal}
                      onPhotosChange={onPhotosChange}
                    />
                  </div>
                </div>
              )
            )}
          </section>
        )
      })()}

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
