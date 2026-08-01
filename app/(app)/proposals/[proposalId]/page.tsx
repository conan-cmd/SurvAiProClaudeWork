"use client"

import { useCallback, useEffect, useRef, useState } from "react"
import { useParams } from "next/navigation"
import { toast } from "sonner"
import {
  Loader2, Sparkles, ChevronUp, ChevronDown, Trash2, Plus, Eye,
  Pencil, Link2, Printer, Check, Send, Copy, Share2, X, MessageCircle, MessageSquare,
  ShieldCheck, ClipboardCheck, Clock, AlertTriangle,
} from "lucide-react"
import { ProposalDocument } from "@/components/proposal-document"
import { PricingEditor, EditableLineItem } from "@/components/pricing-editor"
import { uploadSurveyPhotos, type UploadedPhoto } from "@/lib/photo-upload"
import { RamsButton } from "@/components/rams-button"

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
  survey: {
    id: string
    title: string
    clientCompany: string | null
    clientAddress: string
    latitude: number | null
    longitude: number | null
    what3words: string | null
    areaSqm: number | null
    linearMeters: number | null
    isResidential: boolean
    photos: {
      id: string
      fileUrl: string
      caption: string | null
      includeInProposal: boolean
      internalOnly: boolean
    }[]
  }
  createdBy: {
    name: string | null
    signOffName: string | null
    headshotUrl: string | null
    signatureImageUrl: string | null
  } | null
  organization: {
    name: string
    logoUrl: string | null
    brandColor: string
    secondaryColor: string
    email: string | null
    phone: string | null
    website: string | null
    showCoordinatesOnProposal: boolean
  }
  views: { totalSeconds: number; sections: string | null; createdAt: string; updatedAt: string }[]
  approvalStatus: "NONE" | "PENDING" | "APPROVED" | "CHANGES_REQUESTED"
  reviewNote: string | null
  me: { canSend: boolean; isApprover: boolean; id: string }
}

const STATUSES = ["DRAFT", "READY", "SENT", "SIGNED", "DEPOSIT_PAID", "WON", "LOST"] as const

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
  const [shareUrl, setShareUrl] = useState<string | null>(null)
  const [canShare, setCanShare] = useState(false)
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

  // Native share sheet is only offered where the browser supports it. Resolved
  // after mount to avoid a server/client hydration mismatch on navigator.
  useEffect(() => {
    setCanShare(typeof navigator !== "undefined" && typeof navigator.share === "function")
  }, [])

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
  const addPhotoSection = () => addSection("photos", "Photos")

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

  const [draftingTerms, setDraftingTerms] = useState(false)
  const draftTerms = async (sectionId: string) => {
    if (!proposal) return
    setDraftingTerms(true)
    try {
      const type = proposal.survey.isResidential ? "residential" : "commercial"
      const res = await fetch("/api/organization/generate-terms", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ type }),
      })
      const d = await res.json()
      if (!res.ok) throw new Error(d.error)
      updateSection(sectionId, { content: d.terms })
      // Also save as the org's standard terms so future proposals get them.
      fetch("/api/organization", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(type === "commercial" ? { termsCommercial: d.terms } : { termsAndConditions: d.terms }),
      }).catch(() => {})
      toast.success("Terms drafted — review & edit. Saved as your standard too.")
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Couldn't draft terms")
    } finally {
      setDraftingTerms(false)
    }
  }

  const [pdfBusy, setPdfBusy] = useState(false)
  const pdfRef = useRef<HTMLDivElement>(null)
  const downloadPdf = async () => {
    if (!pdfRef.current || !proposal) return
    setPdfBusy(true)
    try {
      const { exportAndShare } = await import("@/lib/pdf")
      const base = (proposal.survey.title || "proposal").replace(/[^a-z0-9]+/gi, "-").replace(/^-|-$/g, "")
      await exportAndShare(pdfRef.current, `${base || "proposal"}.pdf`, proposal.survey.title || "Proposal")
    } catch {
      toast.error("Couldn't create the PDF — try Preview then your browser's print/share.")
    } finally {
      setPdfBusy(false)
    }
  }

  const [sending, setSending] = useState(false)
  const [sendOpen, setSendOpen] = useState(false)
  const [sendTo, setSendTo] = useState("")
  const [sendMessage, setSendMessage] = useState("")
  const [sendDocIds, setSendDocIds] = useState<string[]>([])
  const [orgDocs, setOrgDocs] = useState<{ id: string; name: string }[]>([])

  const openSend = () => {
    if (!proposal) return
    setSendTo(proposal.clientEmail || "")
    setSendMessage("")
    setSendDocIds([])
    setSendOpen(true)
    if (!orgDocs.length) {
      fetch("/api/documents")
        .then((r) => r.json())
        .then((d) => setOrgDocs(Array.isArray(d) ? d : []))
        .catch(() => {})
    }
  }

  const doSend = async () => {
    if (!proposal || !sendTo.trim()) {
      toast.error("Enter a recipient email")
      return
    }
    setSending(true)
    try {
      const res = await fetch(`/api/proposals/${proposalId}/send`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          to: sendTo.trim(),
          message: sendMessage || undefined,
          documentIds: sendDocIds,
        }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error)
      setProposal({ ...proposal, status: "SENT", clientEmail: sendTo.trim() })
      setSendOpen(false)
      toast.success(`Proposal emailed to ${sendTo.trim()}`)
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to send")
    } finally {
      setSending(false)
    }
  }

  const [reviewBusy, setReviewBusy] = useState(false)

  const submitForReview = async () => {
    if (!proposal) return
    setReviewBusy(true)
    try {
      const res = await fetch(`/api/proposals/${proposalId}/submit-review`, { method: "POST" })
      const d = await res.json()
      if (!res.ok) throw new Error(d.error)
      setProposal({ ...proposal, approvalStatus: "PENDING", reviewNote: null })
      toast.success("Sent for review — an approver will sign it off")
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Couldn't submit for review")
    } finally {
      setReviewBusy(false)
    }
  }

  const review = async (decision: "approve" | "changes") => {
    if (!proposal) return
    let note: string | undefined
    if (decision === "changes") {
      note = window.prompt("What needs changing? (the drafter will see this note)") || undefined
      if (note === undefined) return // cancelled
    }
    setReviewBusy(true)
    try {
      const res = await fetch(`/api/proposals/${proposalId}/review`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ decision, note }),
      })
      const d = await res.json()
      if (!res.ok) throw new Error(d.error)
      setProposal({
        ...proposal,
        approvalStatus: decision === "approve" ? "APPROVED" : "CHANGES_REQUESTED",
        reviewNote: decision === "approve" ? null : (note || null),
      })
      toast.success(decision === "approve" ? "Approved — ready to send" : "Sent back with your notes")
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Couldn't complete the review")
    } finally {
      setReviewBusy(false)
    }
  }

  const createShareLink = async () => {
    setSharing(true)
    try {
      const res = await fetch(`/api/proposals/${proposalId}/share`, { method: "POST" })
      if (!res.ok) throw new Error((await res.json()).error)
      const { url } = await res.json()
      setShareUrl(url)
      // Attempt an immediate copy for the desktop happy path. On iOS Safari the
      // await above voids the tap's user activation, so writeText rejects — that's
      // expected here; the link is now shown in the box below with Copy/Share
      // buttons whose taps ARE fresh gestures and so succeed. Only claim "copied"
      // when it genuinely worked, rather than toasting success unconditionally.
      let copied = false
      try {
        await navigator.clipboard.writeText(url)
        copied = true
      } catch {
        /* clipboard blocked (e.g. iOS after async work) — fall back to the box */
      }
      toast.success(
        copied
          ? "Secure link copied to clipboard (valid 30 days)"
          : "Secure link created (valid 30 days) — tap Copy below"
      )
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to create link")
    } finally {
      setSharing(false)
    }
  }

  // Triggered directly by a button tap with no await before the write, so the
  // user activation is still live — this is what makes copy reliable on iOS.
  const copyShareUrl = async () => {
    if (!shareUrl) return
    try {
      await navigator.clipboard.writeText(shareUrl)
      toast.success("Copied to clipboard")
    } catch {
      toast.error("Couldn't copy — select the link and copy it manually")
    }
  }

  const nativeShareUrl = async () => {
    if (!shareUrl) return
    try {
      await navigator.share({
        title: proposal ? `Proposal — ${proposal.clientName}` : "Proposal",
        url: shareUrl,
      })
    } catch (err) {
      // User dismissed the share sheet — nothing to report.
      if (err instanceof DOMException && err.name === "AbortError") return
      toast.error("Couldn't open the share sheet")
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
    title: proposal.survey.title,
    clientCompany: proposal.survey.clientCompany,
    siteAddress: proposal.survey.clientAddress,
    sections: proposal.sections,
    pricingLineItems: proposal.pricingLineItems,
    photos: proposal.survey.photos.filter((p) => p.includeInProposal && !p.internalOnly),
    latitude: proposal.survey.latitude,
    longitude: proposal.survey.longitude,
    what3words: proposal.survey.what3words,
    showCoordinates: proposal.organization.showCoordinatesOnProposal,
    organization: proposal.organization,
    preparer: proposal.createdBy,
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
          <button onClick={downloadPdf} disabled={pdfBusy}
            className="inline-flex items-center gap-1.5 px-3 py-2 border rounded-lg text-sm font-medium bg-white hover:bg-gray-50 disabled:opacity-50">
            {pdfBusy ? <Loader2 className="w-4 h-4 animate-spin" /> : <Printer className="w-4 h-4" />} PDF
          </button>
          <RamsButton surveyId={proposal.survey.id}
            className="inline-flex items-center gap-1.5 px-3 py-2 border border-amber-200 rounded-lg text-sm font-medium bg-amber-50 text-amber-700 hover:bg-amber-100 disabled:opacity-50" />
          <button onClick={createShareLink} disabled={sharing}
            className="inline-flex items-center gap-1.5 px-3 py-2 border rounded-lg text-sm font-medium bg-white hover:bg-gray-50 disabled:opacity-50">
            <Link2 className="w-4 h-4" /> Share
          </button>
          {/* Approver actions when a proposal is waiting on sign-off */}
          {proposal.me.isApprover && proposal.approvalStatus === "PENDING" && (
            <>
              <button onClick={() => review("approve")} disabled={reviewBusy}
                className="inline-flex items-center gap-1.5 px-3 py-2 bg-emerald-600 text-white rounded-lg text-sm font-semibold hover:bg-emerald-700 disabled:opacity-50">
                {reviewBusy ? <Loader2 className="w-4 h-4 animate-spin" /> : <ShieldCheck className="w-4 h-4" />} Approve
              </button>
              <button onClick={() => review("changes")} disabled={reviewBusy}
                className="inline-flex items-center gap-1.5 px-3 py-2 border border-amber-300 text-amber-700 bg-amber-50 rounded-lg text-sm font-medium hover:bg-amber-100 disabled:opacity-50">
                Request changes
              </button>
            </>
          )}

          {(proposal.me.canSend || proposal.approvalStatus === "APPROVED") ? (
            <button onClick={openSend} disabled={sending}
              className="inline-flex items-center gap-1.5 px-3 py-2 bg-brand-blue text-white rounded-lg text-sm font-semibold hover:bg-blue-700 disabled:opacity-50">
              {sending ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
              Send
            </button>
          ) : proposal.approvalStatus === "PENDING" ? (
            <span className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg text-sm font-medium bg-gray-100 text-gray-500">
              <Clock className="w-4 h-4" /> Awaiting review
            </span>
          ) : (
            <button onClick={submitForReview} disabled={reviewBusy}
              className="inline-flex items-center gap-1.5 px-3 py-2 bg-brand-blue text-white rounded-lg text-sm font-semibold hover:bg-blue-700 disabled:opacity-50">
              {reviewBusy ? <Loader2 className="w-4 h-4 animate-spin" /> : <ClipboardCheck className="w-4 h-4" />}
              Submit for review
            </button>
          )}
        </div>
      </div>

      {/* Approval-state banners */}
      {proposal.approvalStatus === "PENDING" && (
        <div className="no-print flex items-start gap-2 rounded-lg border border-blue-200 bg-blue-50 px-3 py-2.5 text-sm text-blue-800">
          <Clock className="w-4 h-4 mt-0.5 shrink-0" />
          <span>{proposal.me.isApprover ? "This proposal is waiting for your sign-off. Approve it or request changes above." : "Submitted for review — you'll be able to send it once an approver signs it off."}</span>
        </div>
      )}
      {proposal.approvalStatus === "CHANGES_REQUESTED" && (
        <div className="no-print flex items-start gap-2 rounded-lg border border-amber-300 bg-amber-50 px-3 py-2.5 text-sm text-amber-800">
          <AlertTriangle className="w-4 h-4 mt-0.5 shrink-0" />
          <span>
            <strong>Changes requested.</strong>{proposal.reviewNote ? ` ${proposal.reviewNote}` : ""} Make your edits, then submit for review again.
          </span>
        </div>
      )}
      {proposal.approvalStatus === "APPROVED" && (
        <div className="no-print flex items-start gap-2 rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2.5 text-sm text-emerald-800">
          <ShieldCheck className="w-4 h-4 mt-0.5 shrink-0" />
          <span>Signed off and ready to send.</span>
        </div>
      )}

      {shareUrl && (
        <div className="no-print flex flex-wrap items-center gap-2 rounded-lg border border-brand-blue/30 bg-blue-50 px-3 py-2">
          <input
            readOnly
            value={shareUrl}
            onFocus={(e) => e.currentTarget.select()}
            className="flex-1 min-w-0 bg-white border rounded-md px-2 py-1.5 text-sm text-gray-700"
          />
          <button onClick={copyShareUrl}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 border rounded-lg text-sm font-medium bg-white hover:bg-gray-50">
            <Copy className="w-4 h-4" /> Copy
          </button>
          {(() => {
            const msg = `Hi ${proposal.clientName}, here's your proposal for ${proposal.survey.title}: ${shareUrl}`
            return (
              <>
                <a href={`https://wa.me/?text=${encodeURIComponent(msg)}`} target="_blank" rel="noopener noreferrer"
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm font-semibold bg-[#25D366] text-white hover:brightness-95">
                  <MessageCircle className="w-4 h-4" /> WhatsApp
                </a>
                <a href={`sms:?&body=${encodeURIComponent(msg)}`}
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 border rounded-lg text-sm font-medium bg-white hover:bg-gray-50">
                  <MessageSquare className="w-4 h-4" /> Text
                </a>
              </>
            )
          })()}
          {canShare && (
            <button onClick={nativeShareUrl}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 border rounded-lg text-sm font-medium bg-white hover:bg-gray-50">
              <Share2 className="w-4 h-4" /> Share
            </button>
          )}
          <button onClick={() => setShareUrl(null)} aria-label="Dismiss"
            className="inline-flex items-center justify-center p-1.5 text-gray-400 hover:text-gray-600">
            <X className="w-4 h-4" />
          </button>
        </div>
      )}

      {proposal.views.length > 0 && (() => {
        const viewCount = proposal.views.length
        const totalRead = proposal.views.reduce((s, v) => s + v.totalSeconds, 0)
        const avg = Math.round(totalRead / viewCount)
        const secByTitle: Record<string, number> = {}
        for (const v of proposal.views) {
          try {
            const arr = v.sections ? (JSON.parse(v.sections) as { title: string; seconds: number }[]) : []
            for (const s of arr) secByTitle[s.title] = (secByTitle[s.title] || 0) + s.seconds
          } catch {
            /* ignore malformed */
          }
        }
        const top = Object.entries(secByTitle).sort((a, b) => b[1] - a[1]).slice(0, 5)
        const fmt = (s: number) => (s >= 60 ? `${Math.floor(s / 60)}m ${s % 60}s` : `${s}s`)
        const firstOpened = new Date(Math.min(...proposal.views.map((v) => new Date(v.createdAt).getTime())))
        const lastOpened = new Date(Math.max(...proposal.views.map((v) => new Date(v.updatedAt).getTime())))
        const rel = (d: Date) => {
          const mins = Math.round((Date.now() - d.getTime()) / 60000)
          if (mins < 1) return "just now"
          if (mins < 60) return `${mins}m ago`
          const hrs = Math.round(mins / 60)
          if (hrs < 24) return `${hrs}h ago`
          return `${Math.round(hrs / 24)}d ago`
        }
        const dt = (d: Date) => d.toLocaleString("en-GB", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" })
        return (
          <div className="no-print bg-white rounded-xl shadow-sm p-4 text-sm">
            <div className="font-semibold text-brand-navy mb-2">Client engagement</div>
            <div className="flex flex-wrap gap-4 text-gray-600 mb-2">
              <span><strong>{viewCount}</strong> read{viewCount > 1 ? "s" : ""}</span>
              <span>Total time <strong>{fmt(totalRead)}</strong></span>
              <span>Avg <strong>{fmt(avg)}</strong></span>
            </div>
            <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-gray-500 mb-3">
              <span>First opened <strong className="text-gray-700">{dt(firstOpened)}</strong></span>
              <span>Last opened <strong className="text-gray-700">{rel(lastOpened)}</strong></span>
            </div>
            {top.length > 0 && (
              <div className="space-y-1">
                <div className="text-xs text-gray-400">Time on each section</div>
                {top.map(([title, secs]) => (
                  <div key={title} className="flex items-center gap-2">
                    <span className="text-gray-600 truncate flex-1 min-w-0">{title}</span>
                    <span className="text-gray-400 text-xs whitespace-nowrap">{fmt(secs)}</span>
                  </div>
                ))}
              </div>
            )}
          </div>
        )
      })()}

      {mode === "preview" ? (
        <>
          <div className="bg-white rounded-xl shadow-sm p-4 md:p-10 print-area">
            <ProposalDocument data={docData} />
          </div>
          <button onClick={() => setMode("edit")}
            className="no-print mt-4 w-full inline-flex items-center justify-center gap-2 py-3 border rounded-xl font-medium text-gray-700 hover:bg-gray-50">
            <Pencil className="w-4 h-4" /> Back to editing
          </button>
        </>
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
                  measuredAreaSqm={proposal.survey.areaSqm}
                  measuredLinearMeters={proposal.survey.linearMeters}
                  onItemsChange={(items) =>
                    setProposal((p) => (p ? { ...p, pricingLineItems: items } : p))
                  }
                />
              ) : section.type === "photos" ? (
                <PhotoPicker proposal={proposal} section={section} updateSection={updateSection}
                  onPhotosUploaded={(newPhotos) =>
                    setProposal((p) =>
                      p ? { ...p, survey: { ...p.survey, photos: [...p.survey.photos, ...newPhotos] } } : p
                    )
                  } />
              ) : section.type === "videos" ? (
                <VideoPicker section={section} updateSection={updateSection} />
              ) : section.type === "gallery" ? (
                <GalleryPicker section={section} updateSection={updateSection} />
              ) : section.type === "cover" ? (
                <p className="text-sm text-gray-400">
                  The cover is generated from the survey details and your branding. See Preview.
                </p>
              ) : (
                <div>
                  {section.type === "terms" && (
                    <div className="mb-2 flex flex-wrap items-center gap-2">
                      <button onClick={() => draftTerms(section.id)} disabled={draftingTerms}
                        className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-blue-50 border border-blue-200 text-brand-blue rounded-lg text-sm font-semibold hover:bg-blue-100 disabled:opacity-50">
                        {draftingTerms ? <Loader2 className="w-4 h-4 animate-spin" /> : <Sparkles className="w-4 h-4" />}
                        {section.content.includes("MISSING") ? "Draft terms with AI" : "Re-draft terms with AI"}
                      </button>
                      <span className="text-xs text-gray-400">Tailored to your services — review before sending. Saved for future proposals too.</span>
                    </div>
                  )}
                  <textarea
                    value={section.content}
                    onChange={(e) => updateSection(section.id, { content: e.target.value })}
                    rows={Math.min(14, Math.max(4, section.content.split("\n").length + 2))}
                    className="w-full text-sm px-3 py-2 border rounded-lg focus:outline-none focus:ring-2 focus:ring-brand-blue leading-relaxed"
                  />
                </div>
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
              <Plus className="w-5 h-5" /> Add text
            </button>
            <button onClick={addPhotoSection}
              className="border-2 border-dashed border-gray-300 rounded-xl py-4 text-gray-500 font-medium hover:border-brand-blue hover:text-brand-blue transition inline-flex items-center justify-center gap-2">
              <Plus className="w-5 h-5" /> Add photos
            </button>
            <button onClick={addVideoSection}
              className="border-2 border-dashed border-gray-300 rounded-xl py-4 text-gray-500 font-medium hover:border-brand-blue hover:text-brand-blue transition inline-flex items-center justify-center gap-2">
              <Plus className="w-5 h-5" /> Add videos
            </button>
            <button onClick={addGallerySection}
              className="border-2 border-dashed border-gray-300 rounded-xl py-4 text-gray-500 font-medium hover:border-brand-blue hover:text-brand-blue transition inline-flex items-center justify-center gap-2">
              <Plus className="w-5 h-5" /> Add gallery photos
            </button>
          </div>

          <button onClick={() => setMode("preview")}
            className="w-full inline-flex items-center justify-center gap-2 py-3.5 bg-brand-navy text-white rounded-xl font-semibold hover:bg-slate-800 transition">
            <Eye className="w-5 h-5" /> Preview proposal
          </button>
        </div>
      )}

      {/* Hidden print copy when in edit mode */}
      {mode === "edit" && (
        <div className="hidden print:block print-area">
          <ProposalDocument data={docData} />
        </div>
      )}

      {/* Off-screen copy used to build the shareable PDF (any mode) */}
      <div ref={pdfRef} className="hidden">
        <ProposalDocument data={docData} />
      </div>

      {sendOpen && (
        <div className="no-print fixed inset-0 z-50 bg-black/40 flex items-end sm:items-center justify-center p-4"
          onClick={() => !sending && setSendOpen(false)}>
          <div className="bg-white rounded-xl shadow-xl w-full max-w-md p-5 space-y-4"
            onClick={(e) => e.stopPropagation()}>
            <h3 className="font-bold text-brand-navy">Send proposal</h3>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">To</label>
              <input type="email" value={sendTo} onChange={(e) => setSendTo(e.target.value)}
                placeholder="client@email.com"
                className="w-full px-3 py-2 border rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-brand-blue" />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Message (optional)</label>
              <textarea rows={3} value={sendMessage} onChange={(e) => setSendMessage(e.target.value)}
                placeholder="A short personal note…"
                className="w-full px-3 py-2 border rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-brand-blue" />
            </div>
            {orgDocs.length > 0 && (
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Attach documents</label>
                <div className="space-y-1 max-h-40 overflow-y-auto border rounded-lg p-2">
                  {orgDocs.map((d) => (
                    <label key={d.id} className="flex items-center gap-2 text-sm text-gray-700 cursor-pointer">
                      <input type="checkbox" checked={sendDocIds.includes(d.id)}
                        onChange={(e) =>
                          setSendDocIds((ids) => e.target.checked ? [...ids, d.id] : ids.filter((x) => x !== d.id))
                        }
                        className="rounded accent-blue-600" />
                      <span className="truncate">{d.name}</span>
                    </label>
                  ))}
                </div>
              </div>
            )}
            <div className="flex justify-end gap-2 pt-1">
              <button onClick={() => setSendOpen(false)} disabled={sending}
                className="px-4 py-2 border rounded-lg text-sm font-medium hover:bg-gray-50">Cancel</button>
              <button onClick={doSend} disabled={sending}
                className="inline-flex items-center gap-2 px-4 py-2 bg-brand-blue text-white rounded-lg text-sm font-semibold hover:bg-blue-700 disabled:opacity-50">
                {sending ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
                Send
              </button>
            </div>
          </div>
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
  const removeSelected = (videoId: string) =>
    updateSection(section.id, { content: JSON.stringify(selected.filter((v) => v.videoId !== videoId)) })

  // Always-visible strip of the chosen videos, so on returning to a proposal it's
  // clear which are selected — even ones not in the currently-loaded channel list.
  const selectedStrip = selected.length > 0 && (
    <div className="mb-3">
      <p className="text-xs font-medium text-gray-500 mb-1.5">Selected for this proposal ({selected.length})</p>
      <div className="flex gap-2 overflow-x-auto pb-1">
        {selected.map((v) => (
          <div key={v.videoId} className="relative shrink-0 w-32">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={v.thumbnail} alt="" className="w-full aspect-video object-cover rounded-lg border-2 border-brand-blue" />
            <button type="button" onClick={() => removeSelected(v.videoId)}
              className="absolute -top-1.5 -right-1.5 bg-white border rounded-full p-0.5 text-gray-500 hover:text-red-600 shadow"
              aria-label={`Remove ${v.title}`}>
              <X className="w-3.5 h-3.5" />
            </button>
            <p className="text-[11px] text-gray-600 mt-1 leading-snug line-clamp-2">{v.title}</p>
          </div>
        ))}
      </div>
    </div>
  )

  if (error) {
    return <div>{selectedStrip}<p className="text-sm text-amber-600">{error}</p></div>
  }
  if (!videos) {
    return (
      <div>
        {selectedStrip}
        <div className="flex items-center gap-2 text-gray-400 text-sm py-2">
          <Loader2 className="w-4 h-4 animate-spin" /> Loading your channel videos…
        </div>
      </div>
    )
  }
  if (!videos.length) {
    return <div>{selectedStrip}<p className="text-sm text-gray-400">No videos found on your channel.</p></div>
  }

  return (
    <div>
      {selectedStrip}
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
  onPhotosUploaded,
}: {
  proposal: ProposalData
  section: Section
  updateSection: (id: string, patch: SectionPatch) => void
  onPhotosUploaded: (photos: UploadedPhoto[]) => void
}) {
  const fileInput = useRef<HTMLInputElement>(null)
  const [uploading, setUploading] = useState(false)

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

  // Upload photos the surveyor forgot to add on the survey step. New photos are
  // attached to the survey and auto-selected into this proposal section.
  const uploadPhotos = async (files: FileList | null) => {
    if (!files?.length) return
    setUploading(true)
    try {
      const created = await uploadSurveyPhotos(proposal.survey.id, files)
      onPhotosUploaded(created)
      updateSection(section.id, { photoIds: [...selected, ...created.map((p) => p.id)] })
      toast.success(`${created.length} photo${created.length > 1 ? "s" : ""} added`)
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Upload failed")
    } finally {
      setUploading(false)
      if (fileInput.current) fileInput.current.value = ""
    }
  }

  const uploadButton = (
    <>
      <input ref={fileInput} type="file" accept="image/*" multiple className="hidden"
        onChange={(e) => uploadPhotos(e.target.files)} />
      <button type="button" onClick={() => fileInput.current?.click()} disabled={uploading}
        className="inline-flex items-center gap-1.5 text-sm font-semibold text-brand-blue hover:underline disabled:opacity-50">
        {uploading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Plus className="w-4 h-4" />}
        {uploading ? "Uploading…" : "Add photos"}
      </button>
    </>
  )

  if (!proposal.survey.photos.length) {
    return (
      <div className="space-y-2">
        <p className="text-sm text-gray-400">No photos on this survey yet.</p>
        {uploadButton}
      </div>
    )
  }

  return (
    <div className="space-y-3">
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
      {uploadButton}
    </div>
  )
}
