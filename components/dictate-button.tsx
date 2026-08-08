"use client"

import { useEffect, useRef, useState } from "react"
import { Mic, Square, Loader2 } from "lucide-react"
import { toast } from "sonner"

// Screen Wake Lock isn't in the default TS lib yet — describe just what we use.
type WakeLockSentinelLike = { release: () => Promise<void> }
type NavigatorWakeLock = Navigator & {
  wakeLock?: { request: (type: "screen") => Promise<WakeLockSentinelLike> }
}

// Tap-to-dictate powered by Whisper: record -> transcribe -> append text.
// Records until you stop (no length limit), keeps the screen awake while recording,
// and if the phone sleeps / the app is backgrounded it saves what you've said so
// far rather than losing it.
export function DictateButton({
  onText,
  className = "",
}: {
  onText: (text: string) => void
  className?: string
}) {
  const [state, setState] = useState<"idle" | "recording" | "transcribing">("idle")
  const [seconds, setSeconds] = useState(0)
  const recorderRef = useRef<MediaRecorder | null>(null)
  const chunksRef = useRef<Blob[]>([])
  const wakeLockRef = useRef<WakeLockSentinelLike | null>(null)
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null)
  const onTextRef = useRef(onText)
  onTextRef.current = onText

  const stopTimer = () => {
    if (timerRef.current) {
      clearInterval(timerRef.current)
      timerRef.current = null
    }
  }
  const releaseWakeLock = () => {
    wakeLockRef.current?.release().catch(() => {})
    wakeLockRef.current = null
  }
  const stopRecording = () => {
    if (recorderRef.current?.state === "recording") recorderRef.current.stop()
  }

  useEffect(() => {
    // If the screen sleeps or the app is backgrounded mid-recording, iOS suspends
    // the mic — stop and transcribe what's captured so nothing is lost.
    const onHide = () => {
      if (document.hidden && recorderRef.current?.state === "recording") stopRecording()
    }
    document.addEventListener("visibilitychange", onHide)
    return () => {
      document.removeEventListener("visibilitychange", onHide)
      stopTimer()
      releaseWakeLock()
      if (recorderRef.current?.state === "recording") recorderRef.current.stop()
    }
  }, [])

  const start = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true })
      const recorder = new MediaRecorder(stream)
      chunksRef.current = []
      recorder.ondataavailable = (e) => {
        if (e.data.size > 0) chunksRef.current.push(e.data)
      }
      recorder.onstop = async () => {
        stream.getTracks().forEach((t) => t.stop())
        stopTimer()
        releaseWakeLock()
        setState("transcribing")
        try {
          const blob = new Blob(chunksRef.current, { type: recorder.mimeType || "audio/webm" })
          if (blob.size === 0) {
            setState("idle")
            return
          }
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
      // Timeslice: collect a chunk every second so long — or interrupted —
      // recordings still have their audio.
      recorder.start(1000)
      recorderRef.current = recorder
      setSeconds(0)
      setState("recording")
      timerRef.current = setInterval(() => setSeconds((s) => s + 1), 1000)
      // Best-effort: keep the screen awake so it doesn't sleep mid-dictation.
      try {
        const wl = (navigator as NavigatorWakeLock).wakeLock
        if (wl) wakeLockRef.current = await wl.request("screen")
      } catch {
        /* wake lock not supported / denied — the visibility handler still saves audio */
      }
    } catch {
      toast.error("Microphone blocked — allow mic access in your browser's address bar")
    }
  }

  const toggle = () => {
    if (state === "recording") stopRecording()
    else if (state === "idle") start()
  }

  const mmss = `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, "0")}`

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
      {state === "recording" ? `Stop · ${mmss}` : state === "transcribing" ? "Transcribing…" : "Dictate"}
    </button>
  )
}
