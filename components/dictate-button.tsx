"use client"

import { useEffect, useRef, useState } from "react"
import { Mic, Square } from "lucide-react"
import { toast } from "sonner"

// Tap-to-dictate using the browser's built-in speech recognition
// (Chrome, Edge, Safari incl. iOS). Renders nothing when unsupported.
export function DictateButton({
  onText,
  className = "",
}: {
  onText: (text: string) => void
  className?: string
}) {
  const [supported, setSupported] = useState(false)
  const [listening, setListening] = useState(false)
  const recognitionRef = useRef<{ stop: () => void } | null>(null)
  const onTextRef = useRef(onText)
  onTextRef.current = onText

  useEffect(() => {
    const w = window as unknown as Record<string, unknown>
    setSupported(Boolean(w.SpeechRecognition || w.webkitSpeechRecognition))
    return () => recognitionRef.current?.stop()
  }, [])

  const toggle = () => {
    if (listening) {
      recognitionRef.current?.stop()
      return
    }
    const w = window as unknown as Record<string, any>
    const SR = w.SpeechRecognition || w.webkitSpeechRecognition
    const rec = new SR()
    rec.lang = "en-GB"
    rec.continuous = true
    rec.interimResults = false

    rec.onresult = (event: any) => {
      let text = ""
      for (let i = event.resultIndex; i < event.results.length; i++) {
        if (event.results[i].isFinal) text += event.results[i][0].transcript
      }
      if (text.trim()) onTextRef.current(text.trim())
    }
    rec.onerror = (event: any) => {
      setListening(false)
      if (event.error === "not-allowed") {
        toast.error("Microphone blocked — allow mic access in your browser's address bar")
      }
    }
    rec.onend = () => setListening(false)

    rec.start()
    recognitionRef.current = rec
    setListening(true)
  }

  if (!supported) return null

  return (
    <button
      type="button"
      onClick={toggle}
      title={listening ? "Stop dictating" : "Dictate with your voice"}
      className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-xs font-semibold transition ${
        listening
          ? "bg-red-600 text-white animate-pulse"
          : "text-brand-blue hover:bg-blue-50"
      } ${className}`}
    >
      {listening ? <Square className="w-3 h-3" /> : <Mic className="w-3.5 h-3.5" />}
      {listening ? "Stop" : "Dictate"}
    </button>
  )
}
