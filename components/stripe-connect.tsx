"use client"

import { useEffect, useState } from "react"
import { toast } from "sonner"
import { Loader2, CreditCard, CheckCircle2, ExternalLink } from "lucide-react"

type Status = { connected: boolean; chargesEnabled: boolean; detailsSubmitted?: boolean }

// Lets a firm connect their own Stripe account so client deposits pay them directly.
export function StripeConnect() {
  const [status, setStatus] = useState<Status | null>(null)
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    fetch("/api/stripe/connect")
      .then((r) => r.json())
      .then((d) => setStatus(d))
      .catch(() => setStatus({ connected: false, chargesEnabled: false }))
  }, [])

  const start = async () => {
    setBusy(true)
    try {
      const res = await fetch("/api/stripe/connect", { method: "POST" })
      const d = await res.json()
      if (!res.ok) throw new Error(d.error)
      window.location.href = d.url
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Couldn't start Stripe setup")
      setBusy(false)
    }
  }

  return (
    <section className="bg-white rounded-xl shadow-sm p-5 space-y-3">
      <div className="flex items-center gap-2">
        <CreditCard className="w-5 h-5 text-brand-blue" />
        <h2 className="font-semibold text-brand-navy">Payments — deposits</h2>
      </div>

      {status === null ? (
        <div className="flex items-center gap-2 text-sm text-gray-400">
          <Loader2 className="w-4 h-4 animate-spin" /> Checking payment setup…
        </div>
      ) : status.connected && status.chargesEnabled ? (
        <div className="flex items-start gap-2 text-sm">
          <CheckCircle2 className="w-5 h-5 text-emerald-600 shrink-0 mt-0.5" />
          <div>
            <div className="font-medium text-emerald-700">Connected — deposits pay you directly</div>
            <p className="text-gray-500">
              Client deposits go straight into your own Stripe account and pay out to your bank.
            </p>
            <button onClick={start} disabled={busy}
              className="mt-2 inline-flex items-center gap-1.5 text-xs text-gray-500 hover:text-brand-blue">
              {busy ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <ExternalLink className="w-3.5 h-3.5" />}
              Manage / update Stripe details
            </button>
          </div>
        </div>
      ) : (
        <div className="space-y-3">
          <p className="text-sm text-gray-500">
            {status.connected
              ? "Your Stripe setup isn't finished yet — complete it so you can take deposits."
              : "Connect your Stripe account so client deposits are paid straight to you (rather than held centrally). Takes a few minutes."}
          </p>
          <button onClick={start} disabled={busy}
            className="inline-flex items-center gap-2 px-4 py-2 bg-brand-blue text-white rounded-lg text-sm font-semibold hover:bg-blue-700 disabled:opacity-50">
            {busy ? <Loader2 className="w-4 h-4 animate-spin" /> : <CreditCard className="w-4 h-4" />}
            {status.connected ? "Finish Stripe setup" : "Connect Stripe"}
          </button>
        </div>
      )}
    </section>
  )
}
