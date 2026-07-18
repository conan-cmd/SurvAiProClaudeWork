"use client"

import { useRef, useState } from "react"
import { toast } from "sonner"
import { Mic, Square, Upload, Loader2, CheckCircle2, Pencil } from "lucide-react"

export type VoiceNoteWithTranscript = {
  id: string
  fileUrl: string
  fileName: string
  duration: number
  transcript: {
    id: string
    text: string
    approved: boolean
  } | null
}

export function VoiceNotes({
  surveyId,
  voiceNotes,
  onChange,
}: {
  surveyId: string
  voiceNotes: VoiceNoteWithTranscript[]
  onChange: (notes: VoiceNoteWithTranscript[]) => void
}) {
  const [recording, setRecording] = useState(false)
  const [processing, setProcessing] = useState(false)
  const [elapsed, setElapsed] = useState(0)
  const mediaRecorder = useRef<MediaRecorder | null>(null)
  const chunks = useRef<Blob[]>([])
  const timer = useRef<ReturnType<typeof setInterval> | null>(null)
  const fileInput = useRef<HTMLInputElement>(null)

  const startRecording = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true })
      const recorder = new MediaRecorder(stream)
      chunks.current = []
      recorder.ondataavailable = (e) => chunks.current.push(e.data)
      recorder.onstop = () => {
        stream.getTracks().forEach((t) => t.stop())
        const blob = new Blob(chunks.current, { type: recorder.mimeType || "audio/webm" })
        const file = new File([blob], `voice-note-${Date.now()}.webm`, { type: blob.type })
        uploadAudio(file, elapsed)
      }
      recorder.start()
      mediaRecorder.current = recorder
      setElapsed(0)
      setRecording(true)
      timer.current = setInterval(() => setElapsed((s) => s + 1), 1000)
    } catch {
      toast.error("Microphone access denied. You can upload an audio file instead.")
    }
  }

  const stopRecording = () => {
    if (timer.current) clearInterval(timer.current)
    setRecording(false)
    mediaRecorder.current?.stop()
  }

  const uploadAudio = async (file: File, duration: number) => {
    setProcessing(true)
    try {
      const formData = new FormData()
      formData.append("audio", file)
      formData.append("duration", String(duration))
      const res = await fetch(`/api/surveys/${surveyId}/voice`, {
        method: "POST",
        body: formData,
      })
      if (!res.ok) throw new Error((await res.json()).error || "Upload failed")
      const { voiceNote, transcript } = await res.json()
      onChange([...voiceNotes, { ...voiceNote, transcript }])
      toast.success("Transcribed! Please review the transcript below.")
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to process voice note")
    } finally {
      setProcessing(false)
    }
  }

  const saveTranscript = async (
    note: VoiceNoteWithTranscript,
    text: string,
    approved: boolean
  ) => {
    if (!note.transcript) return
    const res = await fetch(
      `/api/surveys/${surveyId}/transcripts/${note.transcript.id}`,
      {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text, approved }),
      }
    )
    if (!res.ok) {
      toast.error("Failed to save transcript")
      return
    }
    const updated = await res.json()
    onChange(
      voiceNotes.map((n) =>
        n.id === note.id ? { ...n, transcript: updated } : n
      )
    )
    if (approved) toast.success("Transcript approved — it will be used for generation")
  }

  const fmt = (s: number) =>
    `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`

  return (
    <div className="space-y-4">
      <div className="flex flex-col sm:flex-row gap-3">
        {!recording ? (
          <button type="button" onClick={startRecording} disabled={processing}
            className="flex-1 inline-flex items-center justify-center gap-2 py-3 bg-brand-navy text-white rounded-xl font-semibold hover:bg-slate-800 transition disabled:opacity-50">
            <Mic className="w-5 h-5" /> Record voice note
          </button>
        ) : (
          <button type="button" onClick={stopRecording}
            className="flex-1 inline-flex items-center justify-center gap-2 py-3 bg-red-600 text-white rounded-xl font-semibold hover:bg-red-700 transition animate-pulse">
            <Square className="w-5 h-5" /> Stop recording ({fmt(elapsed)})
          </button>
        )}
        <input ref={fileInput} type="file" accept="audio/*,video/mp4,video/webm" className="hidden"
          onChange={(e) => {
            const f = e.target.files?.[0]
            if (f) uploadAudio(f, 0)
            e.target.value = ""
          }} />
        <button type="button" onClick={() => fileInput.current?.click()} disabled={recording || processing}
          className="inline-flex items-center justify-center gap-2 px-5 py-3 border-2 border-gray-200 rounded-xl font-semibold text-gray-600 hover:border-brand-blue hover:text-brand-blue transition disabled:opacity-50">
          <Upload className="w-5 h-5" /> Upload audio or video
        </button>
      </div>

      {processing && (
        <div className="flex items-center gap-3 text-gray-500 bg-blue-50 rounded-xl p-4">
          <Loader2 className="w-5 h-5 animate-spin text-brand-blue" />
          Uploading and transcribing — this can take up to a minute…
        </div>
      )}

      {voiceNotes.map((note) => (
        <TranscriptCard key={note.id} note={note} onSave={saveTranscript} />
      ))}
    </div>
  )
}

function TranscriptCard({
  note,
  onSave,
}: {
  note: VoiceNoteWithTranscript
  onSave: (note: VoiceNoteWithTranscript, text: string, approved: boolean) => Promise<void>
}) {
  const [editing, setEditing] = useState(false)
  const [text, setText] = useState(note.transcript?.text || "")
  const [saving, setSaving] = useState(false)

  if (!note.transcript) return null
  const approved = note.transcript.approved

  const handle = async (approve: boolean) => {
    setSaving(true)
    await onSave(note, text, approve)
    setSaving(false)
    setEditing(false)
  }

  return (
    <div className={`border rounded-xl p-4 space-y-3 ${approved ? "border-emerald-200 bg-emerald-50/50" : "border-amber-200 bg-amber-50/40"}`}>
      <div className="flex items-center justify-between">
        <audio controls src={note.fileUrl} className="h-9 max-w-[220px]" />
        {approved ? (
          <span className="inline-flex items-center gap-1 text-emerald-700 text-sm font-semibold">
            <CheckCircle2 className="w-4 h-4" /> Approved
          </span>
        ) : (
          <span className="text-amber-700 text-sm font-semibold">Needs review</span>
        )}
      </div>

      {editing ? (
        <textarea
          value={text}
          onChange={(e) => setText(e.target.value)}
          rows={6}
          className="w-full text-sm px-3 py-2 border rounded-lg focus:outline-none focus:ring-2 focus:ring-brand-blue bg-white"
        />
      ) : (
        <p className="text-sm text-gray-700 whitespace-pre-wrap">{text}</p>
      )}

      <div className="flex gap-2">
        {editing ? (
          <>
            <button type="button" disabled={saving} onClick={() => handle(false)}
              className="px-4 py-1.5 text-sm border rounded-lg font-medium text-gray-600 hover:bg-gray-50 bg-white">
              Save
            </button>
            <button type="button" disabled={saving} onClick={() => handle(true)}
              className="px-4 py-1.5 text-sm bg-brand-green text-white rounded-lg font-semibold hover:bg-emerald-600">
              Save & approve
            </button>
          </>
        ) : (
          <>
            <button type="button" onClick={() => setEditing(true)}
              className="inline-flex items-center gap-1.5 px-4 py-1.5 text-sm border rounded-lg font-medium text-gray-600 hover:bg-gray-50 bg-white">
              <Pencil className="w-3.5 h-3.5" /> Edit
            </button>
            {!approved && (
              <button type="button" disabled={saving} onClick={() => handle(true)}
                className="inline-flex items-center gap-1.5 px-4 py-1.5 text-sm bg-brand-green text-white rounded-lg font-semibold hover:bg-emerald-600">
                <CheckCircle2 className="w-3.5 h-3.5" /> Approve transcript
              </button>
            )}
          </>
        )}
      </div>
    </div>
  )
}
