"use client"

import { useEffect, useRef, useState } from "react"
import { createPortal } from "react-dom"
import { toast } from "sonner"
import { X, Loader2, Phone, Mic, Square, Sparkles } from "lucide-react"
import { parseCallLog } from "@/lib/calls"

// Click-to-call with automatic logging and an AI-tidied after-call note.
// startCall() opens the phone's dialler and logs the call immediately; the
// dialog then waits for a dictated/typed note about how it went.

export function startCall(proposalId: string, phone: string) {
  fetch(`/api/proposals/${proposalId}/call`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({}),
  }).catch(() => {})
  window.location.href = `tel:${phone.replace(/[^\d+]/g, "")}`
}

export function CallNoteDialog({
  proposalId,
  clientName,
  callLog,
  onClose,
  onSaved,
}: {
  proposalId: string
  clientName?: string | null
  callLog: string | null
  onClose: () => void
  onSaved?: (callLog: string) => void
}) {
  const [notes, setNotes] = useState("")
  const [saving, setSaving] = useState(false)
  const [recording, setRecording] = useState(false)
  const [transcribing, setTranscribing] = useState(false)
  const recorder = useRef<MediaRecorder | null>(null)
  const chunks = useRef<Blob[]>([])

  const history = parseCallLog(callLog)

  useEffect(() => {
    const prev = document.body.style.overflow
    document.body.style.overflow = "hidden"
    return () => {
      document.body.style.overflow = prev
      recorder.current?.stream.getTracks().forEach((t) => t.stop())
    }
  }, [])

  const startDictation = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true })
      const mime = MediaRecorder.isTypeSupported("audio/mp4") ? "audio/mp4" : "audio/webm"
      const rec = new MediaRecorder(stream, { mimeType: mime })
      chunks.current = []
      rec.ondataavailable = (e) => e.data.size && chunks.current.push(e.data)
      rec.onstop = async () => {
        stream.getTracks().forEach((t) => t.stop())
        setTranscribing(true)
        try {
          const blob = new Blob(chunks.current, { type: mime })
          const fd = new FormData()
          fd.append("audio", new File([blob], `call-note.${mime.includes("mp4") ? "m4a" : "webm"}`, { type: mime }))
          const res = await fetch("/api/dictate", { method: "POST", body: fd })
          const d = await res.json()
          if (!res.ok) throw new Error(d.error)
          setNotes((prev) => (prev ? `${prev} ${d.text}` : d.text))
        } catch (e) {
          toast.error(e instanceof Error ? e.message : "Couldn't transcribe — type the note instead")
        } finally {
          setTranscribing(false)
        }
      }
      rec.start()
      recorder.current = rec
      setRecording(true)
    } catch {
      toast.error("Microphone not available — type the note instead")
    }
  }

  const stopDictation = () => {
    recorder.current?.stop()
    setRecording(false)
  }

  const save = async () => {
    if (!notes.trim()) {
      onClose()
      return
    }
    setSaving(true)
    try {
      const res = await fetch(`/api/proposals/${proposalId}/call`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ notes: notes.trim() }),
      })
      const d = await res.json()
      if (!res.ok) throw new Error(d.error)
      toast.success("Call note saved")
      onSaved?.(d.callLog)
      onClose()
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Couldn't save the note")
    } finally {
      setSaving(false)
    }
  }

  return createPortal(
    <div className="fixed inset-0 z-50 bg-black/40 flex items-end sm:items-center justify-center p-4 overscroll-contain"
      onClick={() => !saving && onClose()}>
      <div className="bg-white rounded-xl shadow-xl w-full max-w-md p-5 space-y-4 max-h-[85dvh] overflow-y-auto overscroll-contain"
        onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between">
          <h3 className="font-bold text-brand-navy flex items-center gap-2">
            <Phone className="w-4 h-4" /> Call{clientName ? ` — ${clientName}` : ""}
          </h3>
          <button onClick={onClose} disabled={saving} aria-label="Close"
            className="p-1 text-gray-400 hover:text-gray-600"><X className="w-4 h-4" /></button>
        </div>

        {history.length > 0 && (
          <div className="bg-gray-50 border rounded-lg p-3">
            <p className="text-xs font-semibold text-gray-500 mb-1.5">
              {history.length} call{history.length === 1 ? "" : "s"} logged
            </p>
            <ul className="space-y-1.5 max-h-36 overflow-y-auto">
              {history.slice().reverse().map((r, i) => (
                <li key={i} className="text-xs text-gray-600">
                  <span className="font-medium">
                    {new Date(r.at).toLocaleString("en-GB", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" })}
                  </span>
                  {r.by ? <span className="text-gray-400"> · {r.by}</span> : null}
                  {r.summary ? <> — {r.summary}</> : <span className="text-gray-400"> — no note</span>}
                  {r.nextStep && <span className="block text-amber-700">Next: {r.nextStep}</span>}
                </li>
              ))}
            </ul>
          </div>
        )}

        <div className="space-y-2">
          <p className="text-sm font-medium text-gray-700">How did the call go?</p>
          <p className="text-xs text-gray-500">
            Dictate or type a few words — AI tidies it into a summary on the call log.
          </p>
          <textarea spellCheck rows={3} value={notes}
            placeholder="e.g. Spoke to them, happy with the price, wants us to start after the 20th, will sign tonight…"
            onChange={(e) => setNotes(e.target.value)}
            className="w-full text-sm px-3 py-2 border rounded-lg focus:outline-none focus:ring-2 focus:ring-brand-blue" />
          <div className="flex items-center gap-2">
            {recording ? (
              <button type="button" onClick={stopDictation}
                className="inline-flex items-center gap-1.5 px-3 py-2 bg-red-600 text-white rounded-lg text-sm font-semibold animate-pulse">
                <Square className="w-4 h-4" /> Stop recording
              </button>
            ) : (
              <button type="button" onClick={startDictation} disabled={transcribing || saving}
                className="inline-flex items-center gap-1.5 px-3 py-2 border rounded-lg text-sm font-medium text-gray-700 hover:border-brand-blue hover:text-brand-blue disabled:opacity-50">
                {transcribing ? <Loader2 className="w-4 h-4 animate-spin" /> : <Mic className="w-4 h-4" />}
                {transcribing ? "Transcribing…" : "Dictate"}
              </button>
            )}
          </div>
        </div>

        <div className="flex justify-end gap-2 pt-1">
          <button onClick={onClose} disabled={saving}
            className="px-4 py-2 border rounded-lg text-sm font-medium hover:bg-gray-50">
            {notes.trim() ? "Cancel" : "Skip"}
          </button>
          <button onClick={save} disabled={saving || recording || transcribing || !notes.trim()}
            className="inline-flex items-center gap-2 px-4 py-2 bg-brand-blue text-white rounded-lg text-sm font-semibold hover:bg-blue-700 disabled:opacity-50">
            {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Sparkles className="w-4 h-4" />}
            Save note
          </button>
        </div>
      </div>
    </div>,
    document.body
  )
}
