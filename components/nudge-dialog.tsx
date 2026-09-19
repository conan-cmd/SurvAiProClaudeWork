"use client"

import { useEffect, useState } from "react"
import { createPortal } from "react-dom"
import { toast } from "sonner"
import { X, Loader2, BellRing, Video, Mic } from "lucide-react"
import { parseNudgeTemplates, parseNudgeHistory, type NudgeTemplate } from "@/lib/nudge"
import { MediaNoteRecorder } from "@/components/media-note-recorder"

// Self-contained "Send a reminder" dialog — the same flow as the proposal
// editor's nudge (templates, custom message + save-back, missing-email
// capture, optional video/voice message), but usable straight from a list
// row without opening the proposal. Portaled so row transforms can't trap it.
export function NudgeDialog({
  proposalId,
  clientEmail,
  nudgeHistory,
  onClose,
  onSent,
}: {
  proposalId: string
  clientEmail: string | null
  nudgeHistory: string | null
  onClose: () => void
  onSent?: () => void
}) {
  const [templates, setTemplates] = useState<NudgeTemplate[] | null>(null)
  const [templateId, setTemplateId] = useState<string | null>(null)
  const [orgId, setOrgId] = useState<string | null>(null)
  const [custom, setCustom] = useState("")
  const [saveTemplate, setSaveTemplate] = useState(false)
  const [templateName, setTemplateName] = useState("")
  const [email, setEmail] = useState("")
  const [sending, setSending] = useState(false)
  const [recorderMode, setRecorderMode] = useState<"video" | "audio" | null>(null)
  const [media, setMedia] = useState<{
    blob: Blob; mime: string; kind: "video" | "audio"; url: string; poster: Blob | null
  } | null>(null)
  const clearMedia = () =>
    setMedia((m) => {
      if (m) URL.revokeObjectURL(m.url)
      return null
    })

  useEffect(() => {
    fetch("/api/organization")
      .then((r) => r.json())
      .then((org) => {
        setOrgId(org?.id ?? null)
        const t = parseNudgeTemplates(org || {})
        setTemplates(t)
        setTemplateId(t[0]?.id ?? null)
      })
      .catch(() => {
        const t = parseNudgeTemplates({})
        setTemplates(t)
        setTemplateId(t[0]?.id ?? null)
      })
  }, [])

  // Lock the page behind the dialog (mobile scroll otherwise goes to the list).
  useEffect(() => {
    const prev = document.body.style.overflow
    document.body.style.overflow = "hidden"
    return () => {
      document.body.style.overflow = prev
    }
  }, [])

  const history = parseNudgeHistory(nudgeHistory)

  const send = async () => {
    const usingCustom = templateId === "__custom__"
    if (usingCustom && !custom.trim()) {
      toast.error("Write your custom message first")
      return
    }
    if (!clientEmail && !/.+@.+\..+/.test(email.trim())) {
      toast.error("Add the client's email address first")
      return
    }
    setSending(true)
    try {
      if (!clientEmail) {
        const emailRes = await fetch(`/api/proposals/${proposalId}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ clientEmail: email.trim() }),
        })
        if (!emailRes.ok) throw new Error((await emailRes.json()).error || "Couldn't save the email")
      }
      let mediaBody: { mediaUrl: string; mediaType: "video" | "audio"; mediaPosterUrl?: string } | undefined
      if (media) {
        try {
          const { upload } = await import("@vercel/blob/client")
          const oid = orgId || (await fetch("/api/organization").then((r) => r.json())).id
          const ext = media.mime.includes("mp4")
            ? media.kind === "audio" ? "m4a" : "mp4"
            : media.mime.includes("ogg") ? "ogg" : "webm"
          const stamp = Date.now()
          const blob = await upload(
            `organizations/${oid}/nudge-media/${proposalId}-${stamp}.${ext}`,
            media.blob,
            { access: "public", handleUploadUrl: "/api/blob/upload", contentType: media.mime }
          )
          mediaBody = { mediaUrl: blob.url, mediaType: media.kind }
          if (media.poster) {
            try {
              const poster = await upload(
                `organizations/${oid}/nudge-media/${proposalId}-${stamp}-poster.jpg`,
                media.poster,
                { access: "public", handleUploadUrl: "/api/blob/upload", contentType: "image/jpeg" }
              )
              mediaBody.mediaPosterUrl = poster.url
            } catch {
              // Email falls back to the text link.
            }
          }
        } catch {
          throw new Error("Couldn't upload your recording — check your connection and try again")
        }
      }
      const res = await fetch(`/api/proposals/${proposalId}/nudge`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(
          usingCustom
            ? {
                message: custom.trim(),
                messageName: saveTemplate && templateName.trim() ? templateName.trim() : undefined,
                ...mediaBody,
              }
            : { templateId, ...mediaBody }
        ),
      })
      const d = await res.json()
      if (!res.ok) throw new Error(d.error)
      // Save the custom message back as a reusable template without a Settings trip.
      if (usingCustom && saveTemplate && templates) {
        const name = templateName.trim() || "My template"
        const next = [...templates, { id: `t-${Date.now()}`, name, body: custom.trim() }]
        const saved = await fetch("/api/organization", {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ nudgeTemplates: JSON.stringify(next) }),
        })
        if (saved.ok) toast.success(`Saved "${name}" as a template`)
        else toast.error("Reminder sent, but the template couldn't be saved")
      }
      clearMedia()
      toast.success("Reminder sent")
      onSent?.()
      onClose()
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Couldn't send the reminder")
    } finally {
      setSending(false)
    }
  }

  return createPortal(
    <>
      <div className="fixed inset-0 z-50 bg-black/40 flex items-end sm:items-center justify-center p-4 overscroll-contain"
        onClick={() => !sending && onClose()}>
        <div className="bg-white rounded-xl shadow-xl w-full max-w-md p-5 space-y-4 max-h-[85dvh] overflow-y-auto overscroll-contain"
          onClick={(e) => e.stopPropagation()}>
          <div className="flex items-center justify-between">
            <h3 className="font-bold text-brand-navy">Send a reminder</h3>
            <button onClick={onClose} disabled={sending} aria-label="Close"
              className="p-1 text-gray-400 hover:text-gray-600"><X className="w-4 h-4" /></button>
          </div>
          {history.length > 0 ? (
            <div className="bg-gray-50 border rounded-lg p-3">
              <p className="text-xs font-semibold text-gray-500 mb-1.5">
                Nudged {history.length} time{history.length === 1 ? "" : "s"}
              </p>
              <ul className="space-y-1">
                {history.slice().reverse().map((r, i) => (
                  <li key={i} className="text-xs text-gray-600 flex items-center gap-1.5 flex-wrap">
                    {new Date(r.at).toLocaleDateString("en-GB")} — {r.templateName}
                    {r.by ? <span className="text-gray-400">· {r.by}</span> : null}
                    {r.mediaType && r.mediaUrl && (
                      <a href={r.mediaUrl} target="_blank" rel="noopener noreferrer"
                        className="inline-flex items-center gap-1 text-brand-blue font-medium hover:underline">
                        {r.mediaType === "video" ? <Video className="w-3 h-3" /> : <Mic className="w-3 h-3" />}
                        {r.mediaType === "video" ? "video message" : "voice note"}
                      </a>
                    )}
                  </li>
                ))}
              </ul>
            </div>
          ) : (
            <p className="text-xs text-gray-400">No reminders sent yet for this proposal.</p>
          )}
          {!clientEmail && (
            <div className="rounded-lg border border-amber-200 bg-amber-50 p-3">
              <label className="block text-sm font-medium text-amber-800 mb-1.5">
                No client email on this proposal yet — add it here:
              </label>
              <input type="email" value={email} placeholder="client@example.co.uk"
                onChange={(e) => setEmail(e.target.value)}
                className="w-full text-sm px-3 py-2 border rounded-lg bg-white focus:outline-none focus:ring-2 focus:ring-brand-blue" />
            </div>
          )}
          {!templates ? (
            <div className="flex items-center gap-2 text-gray-400 text-sm py-2">
              <Loader2 className="w-4 h-4 animate-spin" /> Loading templates…
            </div>
          ) : (
            <div className="space-y-2">
              <p className="text-sm font-medium text-gray-700">Choose a message</p>
              {templates.map((t) => (
                <label key={t.id}
                  className={`block border rounded-lg p-3 cursor-pointer transition ${
                    templateId === t.id ? "border-brand-blue ring-1 ring-brand-blue bg-blue-50/50" : "hover:border-gray-400"
                  }`}>
                  <span className="flex items-center gap-2">
                    <input type="radio" name="nudge-dialog-template" checked={templateId === t.id}
                      onChange={() => setTemplateId(t.id)} className="accent-blue-600" />
                    <span className="text-sm font-semibold text-gray-800">{t.name}</span>
                  </span>
                  <span className="block text-xs text-gray-500 mt-1.5 leading-relaxed">{t.body}</span>
                </label>
              ))}
              <label
                className={`block border rounded-lg p-3 cursor-pointer transition ${
                  templateId === "__custom__" ? "border-brand-blue ring-1 ring-brand-blue bg-blue-50/50" : "hover:border-gray-400"
                }`}>
                <span className="flex items-center gap-2">
                  <input type="radio" name="nudge-dialog-template" checked={templateId === "__custom__"}
                    onChange={() => setTemplateId("__custom__")} className="accent-blue-600" />
                  <span className="text-sm font-semibold text-gray-800">Custom message</span>
                </span>
                {templateId === "__custom__" && (
                  <span className="block mt-2 space-y-2" onClick={(e) => e.preventDefault()}>
                    <textarea spellCheck rows={3} value={custom} autoFocus
                      placeholder="Write your reminder…"
                      onChange={(e) => setCustom(e.target.value)}
                      className="w-full text-sm px-3 py-2 border rounded-lg focus:outline-none focus:ring-2 focus:ring-brand-blue" />
                    <span className="flex items-center gap-2">
                      <input type="checkbox" checked={saveTemplate}
                        onChange={(e) => setSaveTemplate(e.target.checked)}
                        className="rounded accent-blue-600" id="nudge-dialog-save-template" />
                      <label htmlFor="nudge-dialog-save-template" className="text-xs text-gray-600 cursor-pointer">
                        Save as a template for next time
                      </label>
                    </span>
                    {saveTemplate && (
                      <input value={templateName} placeholder="Template name (e.g. Price-hold reminder)"
                        onChange={(e) => setTemplateName(e.target.value)}
                        className="w-full text-sm px-3 py-1.5 border rounded-lg focus:outline-none focus:ring-2 focus:ring-brand-blue" />
                    )}
                  </span>
                )}
              </label>
              <p className="text-xs text-gray-400">
                Edit saved templates in Settings → Follow-up reminders.
              </p>
            </div>
          )}
          {/* Personal video / voice message — recorded and reviewed before sending */}
          <div className="rounded-lg border p-3 space-y-2">
            <p className="text-sm font-medium text-gray-700">
              Add a personal touch <span className="text-xs text-gray-400 font-normal">(optional)</span>
            </p>
            {media ? (
              <div className="space-y-2">
                {media.kind === "video" ? (
                  <video src={media.url} controls playsInline className="w-full max-h-64 rounded-lg bg-black" />
                ) : (
                  <audio src={media.url} controls className="w-full" />
                )}
                <div className="flex items-center gap-3 text-xs font-medium">
                  <button type="button" onClick={() => { const k = media.kind; clearMedia(); setRecorderMode(k) }}
                    className="text-brand-blue hover:underline">Re-record</button>
                  <button type="button" onClick={clearMedia}
                    className="text-gray-400 hover:text-red-600">Remove</button>
                  <span className="text-gray-400 font-normal">Sends with the reminder — the client watches it on their proposal page.</span>
                </div>
              </div>
            ) : (
              <div className="flex flex-wrap gap-2">
                <button type="button" onClick={() => setRecorderMode("video")}
                  className="inline-flex items-center gap-1.5 px-3 py-2 border rounded-lg text-sm font-medium text-gray-700 hover:border-brand-blue hover:text-brand-blue">
                  <Video className="w-4 h-4" /> Record video
                </button>
                <button type="button" onClick={() => setRecorderMode("audio")}
                  className="inline-flex items-center gap-1.5 px-3 py-2 border rounded-lg text-sm font-medium text-gray-700 hover:border-brand-blue hover:text-brand-blue">
                  <Mic className="w-4 h-4" /> Record voice note
                </button>
              </div>
            )}
          </div>
          <div className="flex justify-end gap-2 pt-1">
            <button onClick={onClose} disabled={sending}
              className="px-4 py-2 border rounded-lg text-sm font-medium hover:bg-gray-50">Cancel</button>
            <button onClick={send} disabled={sending || !templates}
              className="inline-flex items-center gap-2 px-4 py-2 bg-brand-blue text-white rounded-lg text-sm font-semibold hover:bg-blue-700 disabled:opacity-50">
              {sending ? <Loader2 className="w-4 h-4 animate-spin" /> : <BellRing className="w-4 h-4" />}
              Send reminder
            </button>
          </div>
        </div>
      </div>
      {recorderMode && (
        <MediaNoteRecorder
          mode={recorderMode}
          onCancel={() => setRecorderMode(null)}
          onUse={(blob, mime, poster) => {
            setMedia({ blob, mime, kind: recorderMode, url: URL.createObjectURL(blob), poster })
            setRecorderMode(null)
          }}
        />
      )}
    </>,
    document.body
  )
}
