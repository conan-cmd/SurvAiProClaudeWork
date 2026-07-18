"use client"

import { useEffect, useRef, useState } from "react"
import { Mic, Square, Loader2 } from "lucide-react"
import { toast } from "sonner"

// Tap-to-dictate powered by Whisper: record -> transcribe -> append text.
// Works in every modern browser via MediaRecorder.
export function DictateButton({
  onText,
  className = "",
}: {
  onText: (text: string) => void
  className?: string
}) {
  const [state, setState] = useState<"idle" | "recording" | "transcribing">("idle")
  const recorderRef = useRef<MediaRecorder | null>(null)
  const chunksRef = useRef<Blob[]>([])
  const onTextRef = useRef(onText)
  onTextRef.current = onText

  useEffect(() => {
    return () => {
      if (recorderRef.current?.state === "recording") recorderRef.current.stop()
    }
  }, [])

  const start = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true })
      const recorder = new MediaRecorder(stream)
      chunksRef.current = []
      recorder.ondataavailable = (e) => chunksRef.current.push(e.data)
      recorder.onstop = async () => {
        stream.getTracks().forEach((t) => t.stop())
        setState("transcribing")
        try {
          const blob = new Blob(chunksRef.current, { type: recorder.mimeType || "audio/webm" })
          const formData = new FormData()
          formData.append("audio", new File([blob], "dictation.webm", { type: blob.type }))
          const res = await fetch("/api/dictate", { method: "POST", body: formData })
          const data = await res.json()
          if (!res.ok) throw new Error(data.error)
          if (data.text?.trim()) onTextRef.current(data.text.trim())
          else toast.message("Didn't catch that — try again a little closer to the mic")
        } catch (err) {
          toast.error(err instanceof Error ? err.message : "Transcription failed")
        } finally {
          setState("idle")
        }
      }
      recorder.start()
      recorderRef.current = recorder
      setState("recording")
    } catch {
      toast.error("Microphone blocked — allow mic access in your browser's address bar")
    }
  }

  const toggle = () => {
    if (state === "recording") recorderRef.current?.stop()
    else if (state === "idle") start()
  }

  return (
    <button
      type="button"
      onClick={toggle}
      disabled={state === "transcribing"}
      title={state === "recording" ? "Stop and transcribe" : "Dictate with your voice"}
      className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-xs font-semibold transition ${
        state === "recording"
          ? "bg-red-600 text-white animate-pulse"
          : state === "transcribing"
            ? "text-gray-400"
            : "text-brand-blue hover:bg-blue-50"
      } ${className}`}
    >
      {state === "recording" ? (
        <Square className="w-3 h-3" />
      ) : state === "transcribing" ? (
        <Loader2 className="w-3.5 h-3.5 animate-spin" />
      ) : (
        <Mic className="w-3.5 h-3.5" />
      )}
      {state === "recording" ? "Stop" : state === "transcribing" ? "Transcribing…" : "Dictate"}
    </button>
  )
}
