"use client"

import { useEffect, useRef, useState } from "react"
import { createPortal } from "react-dom"
import { Loader2, Mic, Video, X, RotateCcw, Check, Square } from "lucide-react"

const MAX_SECONDS = 90

// Full-screen in-browser recorder for personal follow-up messages: a selfie
// video or a voice note. Records via MediaRecorder, then plays the take back
// for review — nothing leaves the device until the caller uploads it.
export function MediaNoteRecorder({
  mode,
  onUse,
  onCancel,
}: {
  mode: "video" | "audio"
  onUse: (blob: Blob, mimeType: string) => void
  onCancel: () => void
}) {
  const [phase, setPhase] = useState<"starting" | "ready" | "recording" | "review" | "error">("starting")
  const [error, setError] = useState("")
  const [elapsed, setElapsed] = useState(0)
  const [take, setTake] = useState<{ blob: Blob; url: string; mime: string } | null>(null)

  const streamRef = useRef<MediaStream | null>(null)
  const recorderRef = useRef<MediaRecorder | null>(null)
  const chunksRef = useRef<Blob[]>([])
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null)
  const previewRef = useRef<HTMLVideoElement>(null)

  // Pick the first container/codec this browser can actually record.
  const pickMime = (): string => {
    const candidates =
      mode === "video"
        ? ["video/mp4", "video/webm;codecs=vp9,opus", "video/webm;codecs=vp8,opus", "video/webm"]
        : ["audio/mp4", "audio/webm;codecs=opus", "audio/webm", "audio/ogg"]
    for (const c of candidates) {
      try {
        if (MediaRecorder.isTypeSupported(c)) return c
      } catch {
        // isTypeSupported itself can throw on odd browsers — keep trying.
      }
    }
    return ""
  }

  useEffect(() => {
    let cancelled = false
    navigator.mediaDevices
      .getUserMedia(
        mode === "video"
          ? { video: { facingMode: "user", width: { ideal: 1280 } }, audio: true }
          : { audio: true }
      )
      .then((stream) => {
        if (cancelled) {
          stream.getTracks().forEach((t) => t.stop())
          return
        }
        streamRef.current = stream
        if (previewRef.current) previewRef.current.srcObject = stream
        setPhase("ready")
      })
      .catch(() => {
        if (!cancelled) {
          setError(
            mode === "video"
              ? "Couldn't access the camera. Check the browser has camera & microphone permission and try again."
              : "Couldn't access the microphone. Check the browser has microphone permission and try again."
          )
          setPhase("error")
        }
      })
    return () => {
      cancelled = true
      cleanup()
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mode])

  const cleanup = () => {
    if (timerRef.current) clearInterval(timerRef.current)
    try {
      recorderRef.current?.state !== "inactive" && recorderRef.current?.stop()
    } catch {
      // already stopped
    }
    streamRef.current?.getTracks().forEach((t) => t.stop())
    streamRef.current = null
  }

  const start = () => {
    const stream = streamRef.current
    if (!stream) return
    const mime = pickMime()
    let rec: MediaRecorder
    try {
      rec = mime ? new MediaRecorder(stream, { mimeType: mime }) : new MediaRecorder(stream)
    } catch {
      setError("Recording isn't supported in this browser.")
      setPhase("error")
      return
    }
    chunksRef.current = []
    rec.ondataavailable = (e) => {
      if (e.data.size > 0) chunksRef.current.push(e.data)
    }
    rec.onstop = () => {
      const type = rec.mimeType || mime || (mode === "video" ? "video/webm" : "audio/webm")
      const blob = new Blob(chunksRef.current, { type })
      setTake({ blob, url: URL.createObjectURL(blob), mime: type.split(";")[0] })
      setPhase("review")
      if (timerRef.current) clearInterval(timerRef.current)
    }
    recorderRef.current = rec
    rec.start(1000)
    setElapsed(0)
    setPhase("recording")
    timerRef.current = setInterval(() => {
      setElapsed((s) => {
        if (s + 1 >= MAX_SECONDS) stop()
        return s + 1
      })
    }, 1000)
  }

  const stop = () => {
    try {
      if (recorderRef.current?.state === "recording") recorderRef.current.stop()
    } catch {
      // stopping twice is harmless
    }
  }

  const reRecord = () => {
    if (take) URL.revokeObjectURL(take.url)
    setTake(null)
    setElapsed(0)
    // Stream is still live — straight back to ready.
    if (previewRef.current && streamRef.current) previewRef.current.srcObject = streamRef.current
    setPhase("ready")
  }

  const use = () => {
    if (!take) return
    cleanup()
    onUse(take.blob, take.mime)
  }

  const close = () => {
    if (take) URL.revokeObjectURL(take.url)
    cleanup()
    onCancel()
  }

  const fmt = (s: number) => `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`
  const btn = "inline-flex items-center gap-2 px-4 py-2.5 rounded-lg text-sm font-semibold"

  return createPortal(
    <div className="fixed inset-0 z-[120] bg-black/90 flex flex-col items-center justify-center p-4">
      <button type="button" onClick={close} aria-label="Close"
        className="absolute top-4 right-4 p-2 rounded-full bg-white/10 text-white hover:bg-white/20">
        <X className="w-5 h-5" />
      </button>

      <div className="w-full max-w-md space-y-4">
        {phase === "error" ? (
          <div className="bg-white rounded-xl p-5 text-center space-y-3">
            <p className="text-sm text-gray-700">{error}</p>
            <button type="button" onClick={close} className={`${btn} border text-gray-700`}>Close</button>
          </div>
        ) : (
          <>
            {/* Live preview / playback */}
            {mode === "video" ? (
              phase === "review" && take ? (
                <video key="playback" src={take.url} controls playsInline
                  className="w-full rounded-xl bg-black aspect-[3/4] object-contain" />
              ) : (
                <video key="live" ref={previewRef} autoPlay muted playsInline
                  className="w-full rounded-xl bg-black aspect-[3/4] object-cover -scale-x-100" />
              )
            ) : (
              <div className="w-full rounded-xl bg-gray-900 border border-white/10 p-8 flex flex-col items-center gap-4">
                <div className={`w-20 h-20 rounded-full flex items-center justify-center ${
                  phase === "recording" ? "bg-red-500 animate-pulse" : "bg-white/10"
                }`}>
                  <Mic className="w-9 h-9 text-white" />
                </div>
                {phase === "review" && take && (
                  <audio src={take.url} controls className="w-full" />
                )}
              </div>
            )}

            {/* Status + controls */}
            <div className="text-center space-y-3">
              {phase === "starting" && (
                <div className="text-white/70 text-sm inline-flex items-center gap-2">
                  <Loader2 className="w-4 h-4 animate-spin" /> Starting {mode === "video" ? "camera" : "microphone"}…
                </div>
              )}
              {phase === "ready" && (
                <button type="button" onClick={start} className={`${btn} bg-red-600 text-white hover:bg-red-700`}>
                  {mode === "video" ? <Video className="w-4 h-4" /> : <Mic className="w-4 h-4" />}
                  Start recording
                </button>
              )}
              {phase === "recording" && (
                <div className="space-y-2">
                  <div className="text-white font-mono text-lg">
                    <span className="inline-block w-2.5 h-2.5 rounded-full bg-red-500 animate-pulse mr-2" />
                    {fmt(elapsed)} <span className="text-white/50 text-sm">/ {fmt(MAX_SECONDS)}</span>
                  </div>
                  <button type="button" onClick={stop} className={`${btn} bg-white text-gray-900 hover:bg-gray-100`}>
                    <Square className="w-4 h-4 fill-current" /> Stop
                  </button>
                </div>
              )}
              {phase === "review" && (
                <div className="flex items-center justify-center gap-2 flex-wrap">
                  <button type="button" onClick={reRecord} className={`${btn} bg-white/10 text-white hover:bg-white/20`}>
                    <RotateCcw className="w-4 h-4" /> Re-record
                  </button>
                  <button type="button" onClick={use} className={`${btn} bg-emerald-600 text-white hover:bg-emerald-700`}>
                    <Check className="w-4 h-4" /> Use this take
                  </button>
                </div>
              )}
              <p className="text-white/40 text-xs">
                {phase === "review"
                  ? "Watch it back — it only sends when you hit Send in the reminder."
                  : `Up to ${MAX_SECONDS} seconds. You'll review it before anything is sent.`}
              </p>
            </div>
          </>
        )}
      </div>
    </div>,
    document.body
  )
}
