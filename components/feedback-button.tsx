"use client"

import { useState } from "react"
import { toast } from "sonner"
import { MessageSquarePlus, Loader2, X } from "lucide-react"

// Floating beta-feedback widget on every authed screen. Open to all users;
// founding members get a note that their input shapes the roadmap.
export function FeedbackButton({ founding = false }: { founding?: boolean }) {
  const [open, setOpen] = useState(false)
  const [message, setMessage] = useState("")
  const [busy, setBusy] = useState(false)

  const submit = async () => {
    if (message.trim().length < 3) {
      toast.error("Please add a little more detail")
      return
    }
    setBusy(true)
    try {
      const res = await fetch("/api/feedback", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          message: message.trim(),
          context: typeof window !== "undefined" ? window.location.pathname : undefined,
        }),
      })
      const d = await res.json()
      if (!res.ok) throw new Error(d.error)
      toast.success("Thanks — your feedback's been sent 🙌")
      setMessage("")
      setOpen(false)
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Couldn't send feedback")
    } finally {
      setBusy(false)
    }
  }

  return (
    <>
      <button
        onClick={() => setOpen(true)}
        className="no-print fixed z-40 bottom-20 right-4 md:bottom-6 md:right-6 inline-flex items-center gap-1.5 px-3.5 py-2.5 rounded-full bg-brand-navy text-white text-sm font-semibold shadow-lg hover:bg-slate-800"
        aria-label="Send feedback">
        <MessageSquarePlus className="w-4 h-4" /> Feedback
      </button>

      {open && (
        <div className="no-print fixed inset-0 z-50 bg-black/40 flex items-end sm:items-center justify-center p-4"
          onClick={() => !busy && setOpen(false)}>
          <div className="bg-white rounded-xl shadow-xl w-full max-w-md p-5 space-y-3"
            onClick={(e) => e.stopPropagation()}>
            <div className="flex items-start justify-between">
              <h3 className="font-bold text-brand-navy">Got a suggestion?</h3>
              <button onClick={() => setOpen(false)} className="text-gray-400 hover:text-gray-600" aria-label="Close">
                <X className="w-4 h-4" />
              </button>
            </div>
            <p className="text-sm text-gray-500">
              {founding
                ? "You're a founding member — your feedback directly shapes the roadmap. What would make SurvAIPro better?"
                : "We're in beta and building fast. Tell us what would make SurvAIPro better — bugs, missing bits, ideas, anything."}
            </p>
            <textarea rows={5} value={message} onChange={(e) => setMessage(e.target.value)}
              placeholder="I'd love it if…"
              className="w-full px-3 py-2 border rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-brand-blue" />
            <div className="flex justify-end gap-2">
              <button onClick={() => setOpen(false)} disabled={busy}
                className="px-4 py-2 border rounded-lg text-sm font-medium hover:bg-gray-50">Cancel</button>
              <button onClick={submit} disabled={busy}
                className="inline-flex items-center gap-2 px-4 py-2 bg-brand-blue text-white rounded-lg text-sm font-semibold hover:bg-blue-700 disabled:opacity-50">
                {busy ? <Loader2 className="w-4 h-4 animate-spin" /> : null} Send feedback
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  )
}
