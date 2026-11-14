"use client"

import { useEffect, useRef, useState } from "react"
import { createPortal } from "react-dom"
import { toast } from "sonner"
import { Mic, Square, Loader2, Sparkles, X, Check, AlertTriangle, Send } from "lucide-react"

type PlannedAction = { tool: string; args: Record<string, unknown>; summary: string }
type PlanResponse = { transcript: string; reply: string; actions: PlannedAction[] }
type ActionResult = { summary: string; ok: boolean; detail: string }

// The SurvAIPro voice assistant: a floating mic. Speak (or type) a command —
// "nudge everyone who's opened but not accepted" — and it comes back with a
// plan. Anything client-facing only happens after the Confirm tap.
export function AssistantButton() {
  const [open, setOpen] = useState(false)
  const [phase, setPhase] = useState<"idle" | "recording" | "thinking" | "plan" | "executing" | "done">("idle")
  const [typed, setTyped] = useState("")
  const [plan, setPlan] = useState<PlanResponse | null>(null)
  const [results, setResults] = useState<ActionResult[]>([])
  const recorderRef = useRef<MediaRecorder | null>(null)
  const chunksRef = useRef<Blob[]>([])

  useEffect(() => {
    return () => {
      if (recorderRef.current?.state === "recording") recorderRef.current.stop()
    }
  }, [])

  const reset = () => {
    setPhase("idle")
    setPlan(null)
    setResults([])
    setTyped("")
  }

  const submitPlanRequest = async (body: FormData | string) => {
    setPhase("thinking")
    try {
      const res = await fetch("/api/assistant", {
        method: "POST",
        ...(typeof body === "string"
          ? { headers: { "Content-Type": "application/json" }, body: JSON.stringify({ text: body }) }
          : { body }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error)
      setPlan(data)
      setPhase("plan")
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "The assistant hit a snag")
      setPhase("idle")
    }
  }

  const startRecording = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true })
      const recorder = new MediaRecorder(stream)
      chunksRef.current = []
      recorder.ondataavailable = (e) => {
        if (e.data.size > 0) chunksRef.current.push(e.data)
      }
      recorder.onstop = () => {
        stream.getTracks().forEach((t) => t.stop())
        const blob = new Blob(chunksRef.current, { type: recorder.mimeType || "audio/webm" })
        if (blob.size === 0) {
          setPhase("idle")
          return
        }
        const formData = new FormData()
        formData.append("audio", new File([blob], "command.webm", { type: blob.type }))
        submitPlanRequest(formData)
      }
      recorder.start(1000)
      recorderRef.current = recorder
      setPhase("recording")
    } catch {
      toast.error("Microphone blocked — allow mic access in your browser's address bar")
    }
  }

  const stopRecording = () => {
    if (recorderRef.current?.state === "recording") recorderRef.current.stop()
  }

  const execute = async () => {
    if (!plan?.actions.length) return
    setPhase("executing")
    try {
      const res = await fetch("/api/assistant/execute", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ actions: plan.actions }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error)
      setResults(data.results || [])
      setPhase("done")
      const failed = (data.results || []).filter((r: ActionResult) => !r.ok).length
      if (failed === 0) toast.success("All done")
      else toast.warning(`${failed} action${failed > 1 ? "s" : ""} couldn't be completed`)
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Couldn't run the actions")
      setPhase("plan")
    }
  }

  return (
    <>
      <button
        type="button"
        aria-label="SurvAIPro assistant"
        onClick={() => {
          setOpen(true)
          reset()
        }}
        className="no-print fixed bottom-[8.5rem] right-4 md:bottom-20 md:right-6 z-40 w-14 h-14 rounded-full bg-gradient-to-br from-violet-600 to-brand-blue text-white shadow-lg shadow-violet-600/30 flex items-center justify-center hover:scale-105 transition"
      >
        <Sparkles className="w-6 h-6" />
      </button>

      {open &&
        createPortal(
          <div
            className="no-print fixed inset-0 z-[90] bg-black/50 flex items-end sm:items-center justify-center p-4"
            onClick={() => phase !== "executing" && setOpen(false)}
          >
            <div
              className="bg-white rounded-2xl shadow-xl w-full max-w-lg p-5 space-y-4 max-h-[85dvh] overflow-y-auto"
              onClick={(e) => e.stopPropagation()}
            >
              <div className="flex items-center justify-between">
                <h3 className="font-bold text-brand-navy flex items-center gap-2">
                  <Sparkles className="w-4 h-4 text-violet-600" /> Assistant
                </h3>
                <button
                  onClick={() => setOpen(false)}
                  disabled={phase === "executing"}
                  aria-label="Close"
                  className="p-1.5 text-gray-400 hover:text-gray-600"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>

              {(phase === "idle" || phase === "recording") && (
                <div className="space-y-4">
                  <p className="text-sm text-gray-500">
                    Try: <em>&ldquo;Nudge everyone who&rsquo;s opened their proposal but not accepted&rdquo;</em> or{" "}
                    <em>&ldquo;Remove the gutter clean from John Smith&rsquo;s proposal and resend it&rdquo;</em>
                  </p>
                  <div className="flex justify-center py-2">
                    <button
                      type="button"
                      onClick={phase === "recording" ? stopRecording : startRecording}
                      className={`w-20 h-20 rounded-full flex items-center justify-center text-white transition ${
                        phase === "recording"
                          ? "bg-red-600 animate-pulse"
                          : "bg-gradient-to-br from-violet-600 to-brand-blue hover:scale-105"
                      }`}
                    >
                      {phase === "recording" ? <Square className="w-8 h-8" /> : <Mic className="w-8 h-8" />}
                    </button>
                  </div>
                  <p className="text-center text-xs text-gray-400">
                    {phase === "recording" ? "Listening — tap to finish" : "Tap to speak"}
                  </p>
                  <form
                    className="flex items-center gap-2"
                    onSubmit={(e) => {
                      e.preventDefault()
                      if (typed.trim()) submitPlanRequest(typed.trim())
                    }}
                  >
                    <input
                      value={typed}
                      onChange={(e) => setTyped(e.target.value)}
                      placeholder="…or type a command"
                      className="flex-1 px-3 py-2 border rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-violet-500"
                    />
                    <button
                      type="submit"
                      disabled={!typed.trim()}
                      aria-label="Send command"
                      className="p-2.5 bg-violet-600 text-white rounded-lg disabled:opacity-40"
                    >
                      <Send className="w-4 h-4" />
                    </button>
                  </form>
                </div>
              )}

              {phase === "thinking" && (
                <div className="py-10 flex flex-col items-center gap-3 text-gray-500">
                  <Loader2 className="w-8 h-8 animate-spin text-violet-600" />
                  <p className="text-sm">Working on it…</p>
                </div>
              )}

              {phase === "plan" && plan && (
                <div className="space-y-4">
                  <p className="text-xs text-gray-400 italic">&ldquo;{plan.transcript}&rdquo;</p>
                  <p className="text-sm text-gray-800 whitespace-pre-line">{plan.reply}</p>
                  {plan.actions.length > 0 && (
                    <div className="space-y-2">
                      {plan.actions.map((a, i) => (
                        <div key={i} className="flex items-start gap-2 text-sm bg-violet-50 border border-violet-200 rounded-lg px-3 py-2">
                          <span className="mt-0.5 w-5 h-5 shrink-0 rounded-full bg-violet-600 text-white text-xs font-bold flex items-center justify-center">
                            {i + 1}
                          </span>
                          <span className="text-gray-800">{a.summary}</span>
                        </div>
                      ))}
                    </div>
                  )}
                  <div className="flex items-center justify-end gap-2 pt-1">
                    <button onClick={reset} className="px-4 py-2 border rounded-lg text-sm font-medium hover:bg-gray-50">
                      Start over
                    </button>
                    {plan.actions.length > 0 && (
                      <button
                        onClick={execute}
                        className="inline-flex items-center gap-2 px-5 py-2 bg-violet-600 text-white rounded-lg text-sm font-semibold hover:bg-violet-700"
                      >
                        <Check className="w-4 h-4" />
                        Confirm &amp; run {plan.actions.length > 1 ? `all ${plan.actions.length}` : ""}
                      </button>
                    )}
                  </div>
                </div>
              )}

              {phase === "executing" && (
                <div className="py-10 flex flex-col items-center gap-3 text-gray-500">
                  <Loader2 className="w-8 h-8 animate-spin text-violet-600" />
                  <p className="text-sm">Running your actions…</p>
                </div>
              )}

              {phase === "done" && (
                <div className="space-y-3">
                  {results.map((r, i) => (
                    <div
                      key={i}
                      className={`flex items-start gap-2 text-sm rounded-lg px-3 py-2 border ${
                        r.ok ? "bg-emerald-50 border-emerald-200" : "bg-red-50 border-red-200"
                      }`}
                    >
                      {r.ok ? (
                        <Check className="w-4 h-4 mt-0.5 text-emerald-600 shrink-0" />
                      ) : (
                        <AlertTriangle className="w-4 h-4 mt-0.5 text-red-600 shrink-0" />
                      )}
                      <div>
                        <p className="text-gray-800">{r.summary}</p>
                        <p className={`text-xs ${r.ok ? "text-emerald-700" : "text-red-700"}`}>{r.detail}</p>
                      </div>
                    </div>
                  ))}
                  <div className="flex justify-end gap-2">
                    <button onClick={reset} className="px-4 py-2 border rounded-lg text-sm font-medium hover:bg-gray-50">
                      New command
                    </button>
                    <button
                      onClick={() => setOpen(false)}
                      className="px-4 py-2 bg-brand-blue text-white rounded-lg text-sm font-semibold hover:bg-blue-700"
                    >
                      Done
                    </button>
                  </div>
                </div>
              )}
            </div>
          </div>,
          document.body
        )}
    </>
  )
}
