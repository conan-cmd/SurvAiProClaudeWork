"use client"

import { useEffect, useState } from "react"
import { toast } from "sonner"
import { Loader2, Sparkles, CreditCard } from "lucide-react"

type Status = {
  exempt: boolean
  status: string | null
  plan: string | null
  currentPeriodEnd: string | null
  hasCustomer: boolean
  founding: boolean
}

const LABELS: Record<string, string> = {
  trialing: "Free trial",
  active: "Active",
  past_due: "Payment overdue",
  canceled: "Cancelled",
  unpaid: "Unpaid",
}

export function BillingStatus() {
  const [s, setS] = useState<Status | null>(null)
  const [busy, setBusy] = useState(false)

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

  if (!s) return null

  const dt = (d: string | null) => (d ? new Date(d).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" }) : null)

  return (
    <section className="bg-white rounded-xl shadow-sm p-5 space-y-3">
      <div className="flex items-center gap-2">
        <Sparkles className="w-5 h-5 text-brand-blue" />
        <h2 className="font-semibold text-brand-navy">Subscription</h2>
      </div>

      {s.exempt ? (
        <p className="text-sm text-gray-500">You have complimentary access — no subscription needed. 🎉</p>
      ) : s.status && ["trialing", "active", "past_due"].includes(s.status) ? (
        <div className="space-y-3">
          <div className="text-sm text-gray-600">
            <span className="inline-flex items-center gap-1.5 font-medium text-emerald-700">
              {LABELS[s.status] || s.status}
            </span>
            {s.plan && (
              <span className="text-gray-400"> · {
                s.founding
                  ? (s.plan === "annual" ? "Founding Annual (£499/yr)" : "Founding Monthly (£49/mo)")
                  : (s.plan === "annual" ? "Annual (£990/yr)" : "Monthly (£99/mo)")
              }</span>
            )}
            {s.currentPeriodEnd && (
              <div className="text-xs text-gray-400 mt-0.5">
                {s.status === "trialing" ? "Trial ends " : "Renews "}{dt(s.currentPeriodEnd)}
              </div>
            )}
          </div>
          <button onClick={portal} disabled={busy}
            className="inline-flex items-center gap-1.5 px-3 py-2 border rounded-lg text-sm font-medium hover:bg-gray-50 disabled:opacity-50">
            {busy ? <Loader2 className="w-4 h-4 animate-spin" /> : <CreditCard className="w-4 h-4" />}
            Manage billing
          </button>
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
    </section>
  )
}
