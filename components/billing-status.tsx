"use client"

import { useEffect, useState } from "react"
import { toast } from "sonner"
import { Loader2, Sparkles, CreditCard, PauseCircle, PlayCircle } from "lucide-react"

type Status = {
  exempt: boolean
  status: string | null
  plan: string | null
  currentPeriodEnd: string | null
  hasCustomer: boolean
  founding: boolean
  pausedUntil: string | null
}

const LABELS: Record<string, string> = {
  trialing: "Free trial",
  active: "Active",
  past_due: "Payment overdue",
  canceled: "Cancelled",
  unpaid: "Unpaid",
}

const REASONS = [
  "Too expensive",
  "Not using it enough",
  "Missing a feature I need",
  "Just testing it out",
  "Switching to something else",
  "Other",
]

const dt = (d: string | null) =>
  d ? new Date(d).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" }) : null

export function BillingStatus() {
  const [s, setS] = useState<Status | null>(null)
  const [busy, setBusy] = useState(false)
  const [modal, setModal] = useState(false)
  const [reason, setReason] = useState("")
  const [pauseMonths, setPauseMonths] = useState(1)

  useEffect(() => {
    fetch("/api/billing/status").then((r) => r.json()).then(setS).catch(() => setS(null))
  }, [])

  const portal = async () => {
    setBusy(true)
    try {
      const res = await fetch("/api/billing/portal", { method: "POST" })
      const d = await res.json()
      if (!res.ok) throw new Error(d.error)
      window.location.href = d.url
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Couldn't open billing")
      setBusy(false)
    }
  }

  const post = async (path: string, body?: object) => {
    setBusy(true)
    try {
      const res = await fetch(path, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: body ? JSON.stringify(body) : undefined,
      })
      const d = await res.json()
      if (!res.ok) throw new Error(d.error)
      return true
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Something went wrong")
      return false
    } finally {
      setBusy(false)
    }
  }

  const doPause = async () => {
    if (await post("/api/billing/cancel", { action: "pause", reason, pauseMonths })) {
      toast.success(`Paused for ${pauseMonths} month${pauseMonths > 1 ? "s" : ""}`)
      setModal(false)
      setTimeout(() => window.location.reload(), 800)
    }
  }
  const doCancel = async () => {
    if (await post("/api/billing/cancel", { action: "cancel", reason })) {
      toast.success("Cancelled — you keep access until the period ends")
      setModal(false)
      setTimeout(() => window.location.reload(), 800)
    }
  }
  const doResume = async () => {
    if (await post("/api/billing/resume")) {
      toast.success("Welcome back — your subscription is active")
      setTimeout(() => window.location.reload(), 800)
    }
  }

  if (!s) return null

  const active = s.status && ["trialing", "active", "past_due"].includes(s.status)
  const paused = s.pausedUntil && new Date(s.pausedUntil).getTime() > Date.now()

  return (
    <section className="bg-white rounded-xl shadow-sm p-5 space-y-3">
      <div className="flex items-center gap-2">
        <Sparkles className="w-5 h-5 text-brand-blue" />
        <h2 className="font-semibold text-brand-navy">Subscription</h2>
      </div>

      {s.exempt ? (
        <p className="text-sm text-gray-500">You have complimentary access — no subscription needed. 🎉</p>
      ) : paused ? (
        <div className="space-y-3">
          <p className="text-sm text-gray-600">
            <span className="font-medium text-amber-700">Paused</span> — resumes {dt(s.pausedUntil)}.
          </p>
          <button onClick={doResume} disabled={busy}
            className="inline-flex items-center gap-1.5 px-4 py-2 bg-brand-blue text-white rounded-lg text-sm font-semibold hover:bg-blue-700 disabled:opacity-50">
            {busy ? <Loader2 className="w-4 h-4 animate-spin" /> : <PlayCircle className="w-4 h-4" />}
            Resume now
          </button>
        </div>
      ) : active ? (
        <div className="space-y-3">
          <div className="text-sm text-gray-600">
            <span className="font-medium text-emerald-700">{LABELS[s.status!] || s.status}</span>
            {s.plan && (
              <span className="text-gray-400"> · {
                s.founding
                  ? (s.plan === "annual" ? "Founding Annual (£790/yr)" : "Founding Monthly (£79/mo)")
                  : (s.plan === "annual" ? "Annual (£1,490/yr)" : "Monthly (£149/mo)")
              }</span>
            )}
            {s.currentPeriodEnd && (
              <div className="text-xs text-gray-400 mt-0.5">
                {s.status === "trialing" ? "Trial ends " : "Renews "}{dt(s.currentPeriodEnd)}
              </div>
            )}
          </div>
          <div className="flex flex-wrap gap-2">
            <button onClick={portal} disabled={busy}
              className="inline-flex items-center gap-1.5 px-3 py-2 border rounded-lg text-sm font-medium hover:bg-gray-50 disabled:opacity-50">
              {busy ? <Loader2 className="w-4 h-4 animate-spin" /> : <CreditCard className="w-4 h-4" />}
              Manage billing
            </button>
            <button onClick={() => setModal(true)}
              className="inline-flex items-center gap-1.5 px-3 py-2 text-sm text-gray-500 hover:text-gray-700">
              Pause or cancel
            </button>
          </div>
        </div>
      ) : (
        <div className="space-y-2">
          <p className="text-sm text-gray-500">
            {s.status === "canceled" || s.status === "unpaid"
              ? "Your subscription has ended."
              : "Start your subscription to keep access."}
          </p>
          <a href="/subscribe"
            className="inline-flex items-center gap-1.5 px-4 py-2 bg-brand-blue text-white rounded-lg text-sm font-semibold hover:bg-blue-700">
            <Sparkles className="w-4 h-4" /> Choose a plan
          </a>
        </div>
      )}

      {modal && (
        <div className="fixed inset-0 z-50 bg-black/40 flex items-end sm:items-center justify-center p-4"
          onClick={() => !busy && setModal(false)}>
          <div className="bg-white rounded-xl shadow-xl w-full max-w-md p-5 space-y-4"
            onClick={(e) => e.stopPropagation()}>
            <h3 className="font-bold text-brand-navy">Before you go…</h3>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1.5">What's the main reason?</label>
              <div className="space-y-1.5">
                {REASONS.map((r) => (
                  <label key={r} className="flex items-center gap-2 text-sm text-gray-700 cursor-pointer">
                    <input type="radio" name="reason" checked={reason === r} onChange={() => setReason(r)}
                      className="accent-blue-600" />
                    {r}
                  </label>
                ))}
              </div>
            </div>

            {/* Save offer: pause instead */}
            <div className="rounded-lg border border-blue-200 bg-blue-50 p-3">
              <div className="flex items-center gap-2 text-sm font-semibold text-brand-navy mb-1">
                <PauseCircle className="w-4 h-4 text-brand-blue" /> Take a break instead?
              </div>
              <p className="text-xs text-gray-500 mb-2">
                Pause billing and keep your data & founding price. Resume any time.
              </p>
              <div className="flex items-center gap-2">
                <select value={pauseMonths} onChange={(e) => setPauseMonths(Number(e.target.value))}
                  className="text-sm border rounded-lg px-2 py-1.5">
                  <option value={1}>1 month</option>
                  <option value={2}>2 months</option>
                  <option value={3}>3 months</option>
                </select>
                <button onClick={doPause} disabled={busy}
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-brand-blue text-white rounded-lg text-sm font-semibold hover:bg-blue-700 disabled:opacity-50">
                  {busy ? <Loader2 className="w-4 h-4 animate-spin" /> : null} Pause instead
                </button>
              </div>
            </div>

            <div className="flex items-center justify-between pt-1">
              <button onClick={() => setModal(false)} disabled={busy}
                className="px-3 py-2 text-sm font-medium text-gray-600 hover:text-gray-800">Never mind</button>
              <button onClick={doCancel} disabled={busy || !reason}
                className="px-4 py-2 text-sm font-semibold text-red-600 hover:bg-red-50 rounded-lg disabled:opacity-40">
                Cancel anyway
              </button>
            </div>
          </div>
        </div>
      )}
    </section>
  )
}
