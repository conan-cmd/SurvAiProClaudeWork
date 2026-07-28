"use client"

import { useState } from "react"
import { toast } from "sonner"
import { Loader2, Check } from "lucide-react"

type Plan = "monthly" | "annual"

const PLANS: { key: Plan; name: string; price: string; sub: string; badge?: string }[] = [
  { key: "annual", name: "Annual", price: "£499", sub: "per year (£41.58/mo)", badge: "Save 15%" },
  { key: "monthly", name: "Monthly", price: "£49", sub: "per month" },
]

const FEATURES = [
  "AI-drafted proposals from a quick site survey",
  "Send, e-sign & take deposits (paid to your own account)",
  "AI RAMS with operative sign-off",
  "Aerial measurements straight into your pricing",
  "Client read-tracking & win notifications",
]

export function SubscribePlans({ lapsed = false }: { lapsed?: boolean }) {
  const [plan, setPlan] = useState<Plan>("annual")
  const [busy, setBusy] = useState(false)

  const start = async () => {
    setBusy(true)
    try {
      const res = await fetch("/api/billing/checkout", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ plan }),
      })
      const d = await res.json()
      if (!res.ok) throw new Error(d.error)
      window.location.href = d.url
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Couldn't start checkout")
      setBusy(false)
    }
  }

  return (
    <div className="min-h-screen bg-gradient-to-b from-brand-navy to-blue-50 flex items-center justify-center p-4">
      <div className="w-full max-w-lg bg-white rounded-2xl shadow-xl p-6 md:p-8">
        <h1 className="text-2xl font-bold text-brand-navy mb-1">
          {lapsed ? "Reactivate your subscription" : "Start your 14-day free trial"}
        </h1>
        <p className="text-gray-600 mb-6">
          {lapsed
            ? "Your subscription has ended — choose a plan to get back in."
            : "Full access to everything. Cancel anytime before day 14 and you won't be charged."}
        </p>

        <div className="grid grid-cols-2 gap-3 mb-6">
          {PLANS.map((p) => (
            <button key={p.key} type="button" onClick={() => setPlan(p.key)}
              className={`relative text-left rounded-xl border-2 p-4 transition ${
                plan === p.key ? "border-brand-blue bg-blue-50" : "border-gray-200 hover:border-gray-300"
              }`}>
              {p.badge && (
                <span className="absolute -top-2 right-3 bg-brand-green text-white text-[11px] font-bold px-2 py-0.5 rounded-full">
                  {p.badge}
                </span>
              )}
              <div className="font-semibold text-brand-navy">{p.name}</div>
              <div className="text-2xl font-bold text-brand-navy mt-1">{p.price}</div>
              <div className="text-xs text-gray-500">{p.sub}</div>
            </button>
          ))}
        </div>

        <ul className="space-y-2 mb-6">
          {FEATURES.map((f) => (
            <li key={f} className="flex items-start gap-2 text-sm text-gray-700">
              <Check className="w-4 h-4 text-brand-green shrink-0 mt-0.5" /> {f}
            </li>
          ))}
        </ul>

        <button onClick={start} disabled={busy}
          className="w-full inline-flex items-center justify-center gap-2 py-3 bg-brand-blue text-white rounded-lg font-semibold hover:bg-blue-700 disabled:opacity-50">
          {busy ? <Loader2 className="w-5 h-5 animate-spin" /> : null}
          {lapsed ? "Reactivate" : "Start free trial"}
        </button>
        <p className="text-center text-xs text-gray-400 mt-3">
          {lapsed
            ? "Secure payment by Stripe."
            : "14 days free, then billed automatically. Card required. Cancel anytime in Settings."}
        </p>
      </div>
    </div>
  )
}
