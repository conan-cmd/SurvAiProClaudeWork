"use client"

import { useCallback, useEffect, useRef, useState } from "react"
import { useParams } from "next/navigation"
import { toast } from "sonner"
import {
  Loader2, Sparkles, ChevronUp, ChevronDown, Trash2, Plus, Eye,
  Pencil, Link2, Printer, Check, Send,
} from "lucide-react"
import { ProposalDocument } from "@/components/proposal-document"
import { PricingEditor, EditableLineItem } from "@/components/pricing-editor"

type Section = {
  id: string
  type: string
  title: string
  content: string
  order: number
  photoIds: string | null
}

type ProposalData = {
  id: string
  clientName: string
  clientEmail: string | null
  templateName: string
  status: string
  sections: Section[]
  pricingLineItems: EditableLineItem[]
  survey: { id: string; photos: { id: string; fileUrl: string; caption: string | null }[] }
  organization: {
    name: string
    logoUrl: string | null
    brandColor: string
    secondaryColor: string
    email: string | null
    phone: string | null
    website: string | null
  }
}

const STATUSES = ["DRAFT", "READY", "SENT", "SIGNED", "WON", "LOST"] as const

// photoIds goes to the API as an array but is stored locally as a JSON string
type SectionPatch = Partial<Omit<Section, "photoIds">> & {
  photoIds?: string[] | string | null
}

export default function ProposalEditorPage() {
  const { proposalId } = useParams<{ proposalId: string }>()
  const [proposal, setProposal] = useState<ProposalData | null>(null)
  const [mode, setMode] = useState<"edit" | "preview">("edit")
  const [regenerating, setRegenerating] = useState<string | null>(null)
  const [sharing, setSharing] = useState(false)
  const [saveState, setSaveState] = useState<"idle" | "saving" | "saved">("idle")
  const saveTimers = useRef<Record<string, ReturnType<typeof setTimeout>>>({})

  useEffect(() => {
    fetch(`/api/proposals/${proposalId}`)
      .then((r) => {
        if (!r.ok) throw new Error()
        return r.json()
      })
      .then(setProposal)
      .catch(() => toast.error("Failed to load proposal"))
  }, [proposalId])

  const updateSection = useCallback(
    (sectionId: string, patch: SectionPatch) => {
      // API expects photoIds as an array; local state stores the JSON string
      const localPatch = {
        ...patch,
        ...(Array.isArray(patch.photoIds) && { photoIds: JSON.stringify(patch.photoIds) }),
      } as Partial<Section>
      setProposal((prev) =>
        prev
          ? {
              ...prev,
              sections: prev.sections.map((s) =>
                s.id === sectionId ? { ...s, ...localPatch } : s
              ),
            }
          : prev
      )
      setSaveState("saving")
      if (saveTimers.current[sectionId]) clearTimeout(saveTimers.current[sectionId])
      saveTimers.current[sectionId] = setTimeout(async () => {
        const res = await fetch(`/api/proposals/${proposalId}/sections/${sectionId}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(patch),
        })
        setSaveState(res.ok ? "saved" : "idle")
        if (!res.ok) toast.error("Autosave failed")
      }, 800)
    },
    [proposalId]
  )

  const moveSection = async (index: number, direction: -1 | 1) => {
    if (!proposal) return
    const target = index + direction
    if (target < 0 || target >= proposal.sections.length) return
    const next = [...proposal.sections]
    ;[next[index], next[target]] = [next[target], next[index]]
    setProposal({ ...proposal, sections: next })
    await fetch(`/api/proposals/${proposalId}/sections`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ sectionIds: next.map((s) => s.id) }),
    })
  }

  const deleteSection = async (sectionId: string) => {
    if (!proposal) return
    if (!confirm("Remove this section from the proposal?")) return
    const prev = proposal.sections
    setProposal({ ...proposal, sections: prev.filter((s) => s.id !== sectionId) })
    const res = await fetch(`/api/proposals/${proposalId}/sections/${sectionId}`, {
      method: "DELETE",
    })
    if (!res.ok) {
      setProposal({ ...proposal, sections: prev })
      toast.error("Failed to remove section")
    }
  }

  const addSection = async (type = "custom", title = "New section") => {
    if (!proposal) return
    const res = await fetch(`/api/proposals/${proposalId}/sections`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        type,
        title,
        content: "",
        order: proposal.sections.length,
      }),
    })
    if (!res.ok) {
      toast.error("Failed to add section")
      return
    }
    const section = await res.json()
    setProposal({ ...proposal, sections: [...proposal.sections, section] })
  }

  const addVideoSection = () => addSection("videos", "Watch Us In Action")
  const addGallerySection = () => addSection("gallery", "Examples of Similar Work")

  const regenerate = async (sectionId: string) => {
    const feedback = prompt(
      "Any feedback for the rewrite? (leave blank to just improve it)"
    )
    if (feedback === null) return
    setRegenerating(sectionId)
    try {
      const res = await fetch(`/api/proposals/${proposalId}/sections/${sectionId}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ feedback: feedback || undefined }),
      })
      if (!res.ok) throw new Error((await res.json()).error)
      const updated = await res.json()
      setProposal((prev) =>
        prev
          ? {
              ...prev,
              sections: prev.sections.map((s) => (s.id === sectionId ? { ...s, ...updated } : s)),
            }
          : prev
      )
      toast.success("Section rewritten — please review it")
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Regeneration failed")
    } finally {
      setRegenerating(null)
    }
  }

  const setStatus = async (status: string) => {
    if (!proposal) return
    const prev = proposal.status
    setProposal({ ...proposal, status })
    const res = await fetch(`/api/proposals/${proposalId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status }),
    })
    if (!res.ok) {
      setProposal({ ...proposal, status: prev })
      toast.error("Failed to update status")
    }
  }

  const [sending, setSending] = useState(false)

  const sendToClient = async () => {
    if (!proposal) return
    const to = prompt("Send proposal to:", proposal.clientEmail || "")
    if (!to) return
    const message = prompt(
      "Add a short message (optional - a default will be used if blank):",
      ""
    )
    if (message === null) return
    setSending(true)
    try {
      const res = await fetch(`/api/proposals/${proposalId}/send`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ to, message: message || undefined }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error)
      setProposal({ ...proposal, status: "SENT", clientEmail: to })
      toast.success(`Proposal emailed to ${to}`)
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to send")
    } finally {
      setSending(false)
    }
  }

  const createShareLink = async () => {
    setSharing(true)
    try {
      const res = await fetch(`/api/proposals/${proposalId}/share`, { method: "POST" })
      if (!res.ok) throw new Error((await res.json()).error)
      const { url } = await res.json()
      await navigator.clipboard.writeText(url).catch(() => {})
      toast.success("Secure link created and copied to clipboard (valid 30 days)")
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to create link")
    } finally {
      setSharing(false)
    }
  }

  if (!proposal) {
    return (
      <div className="flex justify-center py-20">
        <Loader2 className="w-8 h-8 animate-spin text-brand-blue" />
      </div>
    )
  }

  const docData = {
    clientName: proposal.clientName,
    templateName: proposal.templateName,
    sections: proposal.sections,
    pricingLineItems: proposal.pricingLineItems,
    photos: proposal.survey.photos,
    organization: proposal.organization,
  }

  return (
    <div className="max-w-3xl mx-auto space-y-5">
      {/* Toolbar */}
      <div className="no-print flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-xl font-bold text-brand-navy">{proposal.clientName}</h1>
          <span className="text-xs text-gray-400">
            {saveState === "saving" && "Saving…"}
            {saveState === "saved" && (
              <span className="inline-flex items-center gap-1 text-emerald-600">
                <Check className="w-3 h-3" /> Saved
              </span>
            )}
          </span>
        </div>
        <div className="flex flex-wrap items-center gap-2 w-full sm:w-auto">
          <select value={proposal.status} onChange={(e) => setStatus(e.target.value)}
            className="px-3 py-2 border rounded-lg text-sm font-medium bg-white">
            {STATUSES.map((s) => <option key={s} value={s}>{s}</option>)}
          </select>
          <button onClick={() => setMode(mode === "edit" ? "preview" : "edit")}
            className="inline-flex items-center gap-1.5 px-3 py-2 border rounded-lg text-sm font-medium bg-white hover:bg-gray-50">
            {mode === "edit" ? <Eye className="w-4 h-4" /> : <Pencil className="w-4 h-4" />}
            {mode === "edit" ? "Preview" : "Edit"}
          </button>
          <button onClick={() => window.print()}
            className="inline-flex items-center gap-1.5 px-3 py-2 border rounded-lg text-sm font-medium bg-white hover:bg-gray-50">
            <Printer className="w-4 h-4" /> PDF
          </button>
          <button onClick={createShareLink} disabled={sharing}
            className="inline-flex items-center gap-1.5 px-3 py-2 border rounded-lg text-sm font-medium bg-white hover:bg-gray-50 disabled:opacity-50">
            <Link2 className="w-4 h-4" /> Share
          </button>
          <button onClick={sendToClient} disabled={sending}
            className="inline-flex items-center gap-1.5 px-3 py-2 bg-brand-blue text-white rounded-lg text-sm font-semibold hover:bg-blue-700 disabled:opacity-50">
            {sending ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
            Send
          </button>
        </div>
      </div>

      {mode === "preview" ? (
        <div className="bg-white rounded-xl shadow-sm p-4 md:p-10 print-area">
          <ProposalDocument data={docData} />
        </div>
      ) : (
        <div className="space-y-4 no-print">
          {proposal.sections.map((section, index) => (
            <div key={section.id} className="bg-white rounded-xl shadow-sm p-4">
              <div className="flex items-center justify-between mb-2 gap-2">
                <input
                  value={section.title}
                  onChange={(e) => updateSection(section.id, { title: e.target.value })}
                  className="font-semibold text-brand-navy bg-transparent border-b border-transparent hover:border-gray-200 focus:border-brand-blue focus:outline-none flex-1 min-w-0"
                />
                <div className="flex items-center gap-0.5 text-gray-400 shrink-0">
                  <button onClick={() => moveSection(index, -1)} disabled={index === 0}
                    className="p-1.5 hover:bg-gray-100 rounded disabled:opacity-30" title="Move up">
                    <ChevronUp className="w-4 h-4" />
                  </button>
                  <button onClick={() => moveSection(index, 1)}
                    disabled={index === proposal.sections.length - 1}
                    className="p-1.5 hover:bg-gray-100 rounded disabled:opacity-30" title="Move down">
                    <ChevronDown className="w-4 h-4" />
                  </button>
                  {!["cover", "photos", "pricing", "videos", "gallery"].includes(section.type) && (
                    <button onClick={() => regenerate(section.id)}
                      disabled={regenerating === section.id}
                      className="p-1.5 hover:bg-blue-50 hover:text-brand-blue rounded"
                      title="Regenerate this section with AI">
                      {regenerating === section.id ? (
                        <Loader2 className="w-4 h-4 animate-spin" />
                      ) : (
                        <Sparkles className="w-4 h-4" />
                      )}
                    </button>
                  )}
                  <button onClick={() => deleteSection(section.id)}
                    className="p-1.5 hover:bg-red-50 hover:text-red-600 rounded" title="Remove section">
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>
              </div>

              {section.type === "pricing" ? (
                <PricingEditor
                  proposalId={proposal.id}
                  initialItems={proposal.pricingLineItems}
                  onItemsChange={(items) =>
                    setProposal((p) => (p ? { ...p, pricingLineItems: items } : p))
                  }
                />
              ) : section.type === "photos" ? (
                <PhotoPicker proposal={proposal} section={section} updateSection={updateSection} />
              ) : section.type === "videos" ? (
                <VideoPicker section={section} updateSection={updateSection} />
              ) : section.type === "gallery" ? (
                <GalleryPicker section={section} updateSection={updateSection} />
              ) : section.type === "cover" ? (
                <p className="text-sm text-gray-400">
                  The cover is generated from the survey details and your branding. See Preview.
                </p>
              ) : (
                <textarea
                  value={section.content}
                  onChange={(e) => updateSection(section.id, { content: e.target.value })}
                  rows={Math.min(14, Math.max(4, section.content.split("\n").length + 2))}
                  className="w-full text-sm px-3 py-2 border rounded-lg focus:outline-none focus:ring-2 focus:ring-brand-blue leading-relaxed"
                />
              )}
              {section.content.includes("MISSING") && section.type !== "cover" && (
                <p className="text-xs text-amber-600 mt-2 font-medium">
                  This section flags missing information — fill it in before sending.
                </p>
              )}
            </div>
          ))}

          <div className="grid grid-cols-2 gap-3">
            <button onClick={() => addSection()}
              className="border-2 border-dashed border-gray-300 rounded-xl py-4 text-gray-500 font-medium hover:border-brand-blue hover:text-brand-blue transition inline-flex items-center justify-center gap-2">
              <Plus className="w-5 h-5" /> Add section
            </button>
            <button onClick={addVideoSection}
              className="border-2 border-dashed border-gray-300 rounded-xl py-4 text-gray-500 font-medium hover:border-brand-blue hover:text-brand-blue transition inline-flex items-center justify-center gap-2">
              <Plus className="w-5 h-5" /> Add videos
            </button>
            <button onClick={addGallerySection}
              className="col-span-2 border-2 border-dashed border-gray-300 rounded-xl py-4 text-gray-500 font-medium hover:border-brand-blue hover:text-brand-blue transition inline-flex items-center justify-center gap-2">
              <Plus className="w-5 h-5" /> Add similar-work gallery photos
            </button>
          </div>
        </div>
      )}

      {/* Hidden print copy when in edit mode */}
      {mode === "edit" && (
        <div className="hidden print:block print-area">
          <ProposalDocument data={docData} />
        </div>
      )}
    </div>
  )
}

type ChannelVideo = { videoId: string; title: string; thumbnail: string; url: string }

function VideoPicker({
  section,
  updateSection,
}: {
  section: Section
  updateSection: (id: string, patch: SectionPatch) => void
}) {
  const [videos, setVideos] = useState<ChannelVideo[] | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [query, setQuery] = useState("")
  const searchDebounce = useRef<ReturnType<typeof setTimeout> | null>(null)

  useEffect(() => {
    if (searchDebounce.current) clearTimeout(searchDebounce.current)
    searchDebounce.current = setTimeout(() => {
      fetch(`/api/organization/videos${query.trim() ? `?q=${encodeURIComponent(query)}` : ""}`)
        .then(async (r) => {
          const data = await r.json()
          if (!r.ok) throw new Error(data.error)
          setVideos(data)
          setError(null)
        })
        .catch((e) => setError(e instanceof Error ? e.message : "Failed to load videos"))
    }, 400)
  }, [query])

  let selected: ChannelVideo[] = []
  try {
    selected = JSON.parse(section.content || "[]")
  } catch {
    selected = []
  }

  const toggle = (video: ChannelVideo) => {
    const isOn = selected.some((v) => v.videoId === video.videoId)
    const next = isOn
      ? selected.filter((v) => v.videoId !== video.videoId)
      : [...selected, video]
    updateSection(section.id, { content: JSON.stringify(next) })
  }

  if (error) {
    return <p className="text-sm text-amber-600">{error}</p>
  }
  if (!videos) {
    return (
      <div className="flex items-center gap-2 text-gray-400 text-sm py-2">
        <Loader2 className="w-4 h-4 animate-spin" /> Loading your channel videos…
      </div>
    )
  }
  if (!videos.length) {
    return <p className="text-sm text-gray-400">No videos found on your channel.</p>
  }

  return (
    <div>
      <input
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        placeholder="Search your whole channel (e.g. canopy cleaning)…"
        className="w-full mb-2 px-3 py-2 border rounded-lg text-sm focus:outline-none focus:ring-1 focus:ring-brand-blue"
      />
      <p className="text-xs text-gray-500 mb-2">
        Tick the videos of similar jobs to show in this proposal ({selected.length} selected).
      </p>
      <div className="grid grid-cols-2 sm:grid-cols-3 gap-2 max-h-72 overflow-y-auto pr-1">
        {videos.map((video) => {
          const on = selected.some((v) => v.videoId === video.videoId)
          return (
            <button key={video.videoId} type="button" onClick={() => toggle(video)}
              className={`text-left rounded-lg overflow-hidden border-2 transition ${
                on ? "border-brand-blue" : "border-transparent opacity-60 hover:opacity-100"
              }`}>
              <div className="relative">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={video.thumbnail} alt="" className="w-full aspect-video object-cover" />
                {on && (
                  <span className="absolute top-1 right-1 bg-brand-blue text-white rounded-full p-0.5">
                    <Check className="w-3 h-3" />
                  </span>
                )}
              </div>
              <p className="text-xs text-gray-600 p-1.5 leading-snug line-clamp-2">{video.title}</p>
            </button>
          )
        })}
      </div>
    </div>
  )
}

type GalleryItem = { id: string; fileUrl: string; caption: string }

function GalleryPicker({
  section,
  updateSection,
}: {
  section: Section
  updateSection: (id: string, patch: SectionPatch) => void
}) {
  const [all, setAll] = useState<GalleryItem[] | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    fetch("/api/gallery")
      .then(async (r) => {
        const data = await r.json()
        if (!r.ok) throw new Error(data.error)
        setAll(
          data.map((p: { id: string; fileUrl: string; caption: string | null }) => ({
            id: p.id,
            fileUrl: p.fileUrl,
            caption: p.caption || "",
          }))
        )
      })
      .catch((e) => setError(e instanceof Error ? e.message : "Failed to load gallery"))
  }, [])

  let selected: GalleryItem[] = []
  try {
    selected = JSON.parse(section.content || "[]")
  } catch {
    selected = []
  }

  const toggle = (item: GalleryItem) => {
    const on = selected.some((s) => s.id === item.id)
    const next = on ? selected.filter((s) => s.id !== item.id) : [...selected, item]
    updateSection(section.id, { content: JSON.stringify(next) })
  }

  if (error) return <p className="text-sm text-amber-600">{error}</p>
  if (!all) {
    return (
      <div className="flex items-center gap-2 text-gray-400 text-sm py-2">
        <Loader2 className="w-4 h-4 animate-spin" /> Loading gallery…
      </div>
    )
  }
  if (!all.length) {
    return (
      <p className="text-sm text-gray-400">
        Your project gallery is empty — add before/after photos on the Gallery page.
      </p>
    )
  }

  return (
    <div>
      <p className="text-xs text-gray-500 mb-2">
        Tick similar-work photos to include ({selected.length} selected).
      </p>
      <div className="grid grid-cols-3 sm:grid-cols-4 gap-2 max-h-72 overflow-y-auto pr-1">
        {all.map((item) => {
          const on = selected.some((s) => s.id === item.id)
          return (
            <button key={item.id} type="button" onClick={() => toggle(item)}
              className={`relative rounded-lg overflow-hidden border-2 transition ${
                on ? "border-brand-blue" : "border-transparent opacity-60 hover:opacity-100"
              }`}>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={item.fileUrl} alt={item.caption} className="aspect-square object-cover w-full" />
              {on && (
                <span className="absolute top-1 right-1 bg-brand-blue text-white rounded-full p-0.5">
                  <Check className="w-3 h-3" />
                </span>
              )}
            </button>
          )
        })}
      </div>
    </div>
  )
}

function PhotoPicker({
  proposal,
  section,
  updateSection,
}: {
  proposal: ProposalData
  section: Section
  updateSection: (id: string, patch: SectionPatch) => void
}) {
  let selected: string[] = []
  try {
    selected = section.photoIds ? JSON.parse(section.photoIds) : []
  } catch {
    selected = []
  }

  const toggle = (photoId: string) => {
    const next = selected.includes(photoId)
      ? selected.filter((id) => id !== photoId)
      : [...selected, photoId]
    updateSection(section.id, { photoIds: next })
  }

  if (!proposal.survey.photos.length) {
    return <p className="text-sm text-gray-400">No photos on this survey.</p>
  }

  return (
    <div className="grid grid-cols-3 sm:grid-cols-4 gap-2">
      {proposal.survey.photos.map((photo) => {
        const on = selected.includes(photo.id)
        return (
          <button key={photo.id} type="button" onClick={() => toggle(photo.id)}
            className={`relative rounded-lg overflow-hidden border-2 transition ${
              on ? "border-brand-blue" : "border-transparent opacity-50"
            }`}>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={photo.fileUrl} alt={photo.caption || ""} className="aspect-square object-cover w-full" />
            {on && (
              <span className="absolute top-1 right-1 bg-brand-blue text-white rounded-full p-0.5">
                <Check className="w-3 h-3" />
              </span>
            )}
          </button>
        )
      })}
    </div>
  )
}
