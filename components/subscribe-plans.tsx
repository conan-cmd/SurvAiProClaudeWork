"use client"

import { useState } from "react"
import { toast } from "sonner"
import { Loader2, Check } from "lucide-react"

type Plan = "monthly" | "annual"

const PRICES = {
  founding: {
    annual: { name: "Annual", price: "£790", sub: "per year (£65.83/mo)", badge: "2 months free" },
    monthly: { name: "Monthly", price: "£79", sub: "per month" },
  },
  standard: {
    annual: { name: "Annual", price: "£1,490", sub: "per year (£124.17/mo)", badge: "2 months free" },
    monthly: { name: "Monthly", price: "£149", sub: "per month" },
  },
}

const FEATURES = [
  "AI-drafted proposals from a quick site survey",
  "Send, e-sign & take deposits (paid to your own account)",
  "AI RAMS with operative sign-off",
  "Aerial measurements straight into your pricing",
  "Client read-tracking & win notifications",
]

export function SubscribePlans({
  lapsed = false,
  founding = false,
  slotsLeft = 0,
  pausedUntil = null,
  cryptoEnabled = false,
}: { lapsed?: boolean; founding?: boolean; slotsLeft?: number; pausedUntil?: string | null; cryptoEnabled?: boolean }) {
  const [plan, setPlan] = useState<Plan>("annual")
  const [busy, setBusy] = useState(false)
  const [code, setCode] = useState("")
  const [redeeming, setRedeeming] = useState(false)

  const redeem = async () => {
    if (!code.trim()) return
    setRedeeming(true)
    try {
      const res = await fetch("/api/redeem-code", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ code: code.trim() }),
      })
      const d = await res.json()
      if (!res.ok) throw new Error(d.error)
      window.location.href = "/dashboard"
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Couldn't redeem that code")
      setRedeeming(false)
    }
  }

  const resume = async () => {
    setBusy(true)
    try {
      const res = await fetch("/api/billing/resume", { method: "POST" })
      const d = await res.json()
      if (!res.ok) throw new Error(d.error)
      window.location.href = "/dashboard"
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Couldn't resume")
      setBusy(false)
    }
  }

  if (pausedUntil) {
    return (
      <div className="min-h-screen bg-gradient-to-b from-brand-navy to-blue-50 flex items-center justify-center p-4">
        <div className="w-full max-w-md bg-white rounded-2xl shadow-xl p-8 text-center">
          <h1 className="text-2xl font-bold text-brand-navy mb-2">Your account is paused</h1>
          <p className="text-gray-600 mb-6">
            Billing is paused until {new Date(pausedUntil).toLocaleDateString("en-GB", { day: "numeric", month: "long", year: "numeric" })}.
            Resume any time to pick up right where you left off — your data&apos;s all here.
          </p>
          <button onClick={resume} disabled={busy}
            className="w-full inline-flex items-center justify-center gap-2 py-3 bg-brand-blue text-white rounded-lg font-semibold hover:bg-blue-700 disabled:opacity-50">
            {busy ? <Loader2 className="w-5 h-5 animate-spin" /> : null} Resume my subscription
          </button>
        </div>
      </div>
    )
  }
  const prices = founding ? PRICES.founding : PRICES.standard
  const PLANS: { key: Plan; name: string; price: string; sub: string; badge?: string }[] = [
    { key: "annual", ...prices.annual },
    { key: "monthly", ...prices.monthly },
  ]

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

  // Bitcoin is annual-only (crypto can't auto-renew) — pay 12 months upfront.
  const payBtc = async () => {
    setBusy(true)
    try {
      const res = await fetch("/api/billing/crypto/charge", { method: "POST" })
      const d = await res.json()
      if (!res.ok) throw new Error(d.error)
      window.location.href = d.url
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Couldn't start the Bitcoin payment")
      setBusy(false)
    }
  }

  return (
    <div className="min-h-screen bg-gradient-to-b from-brand-navy to-blue-50 flex items-center justify-center p-4">
      <div className="w-full max-w-lg bg-white rounded-2xl shadow-xl p-6 md:p-8">
        <h1 className="text-2xl font-bold text-brand-navy mb-1">
          {lapsed ? "Reactivate your subscription" : "Start your 14-day free trial"}
        </h1>
        <p className="text-gray-600 mb-4">
          {lapsed
            ? "Your subscription has ended — choose a plan to get back in."
            : "Full access to everything. Cancel anytime before day 14 and you won't be charged."}
        </p>

        {founding && (
          <div className="mb-5 rounded-xl bg-brand-navy text-white p-3 text-sm">
            🚀 <strong>Founding member pricing</strong> — only <strong>{slotsLeft} of 100</strong> spots left.
            Lock in £79/mo <span className="opacity-80">(vs £149 later)</span> for life.
          </div>
        )}

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

        {cryptoEnabled && (
          <div className="mt-4 pt-4 border-t">
            <button onClick={payBtc} disabled={busy}
              className="w-full inline-flex items-center justify-center gap-2 py-3 border-2 border-[#f7931a] text-[#b8690f] bg-orange-50 rounded-lg font-semibold hover:bg-orange-100 disabled:opacity-50">
              {busy ? <Loader2 className="w-5 h-5 animate-spin" /> : <span className="text-lg leading-none">₿</span>}
              Pay 1 year with Bitcoin — {prices.annual.price}
            </button>
            <p className="text-center text-xs text-gray-400 mt-2">
              Annual, paid upfront in Bitcoin (no card, no auto-renew). We&apos;ll remind you before it lapses.
            </p>
          </div>
        )}

        {/* Tester / partner access code */}
        <div className="mt-5 pt-4 border-t">
          <label className="block text-xs font-medium text-gray-500 mb-1.5">Got an access code?</label>
          <div className="flex gap-2">
            <input value={code} onChange={(e) => setCode(e.target.value.toUpperCase())}
              placeholder="SURV-XXXXXX"
              className="flex-1 px-3 py-2 border rounded-lg text-sm font-mono focus:outline-none focus:ring-2 focus:ring-brand-blue" />
            <button onClick={redeem} disabled={redeeming || !code.trim()}
              className="px-4 py-2 border rounded-lg text-sm font-semibold hover:bg-gray-50 disabled:opacity-50">
              {redeeming ? <Loader2 className="w-4 h-4 animate-spin" /> : "Redeem"}
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
