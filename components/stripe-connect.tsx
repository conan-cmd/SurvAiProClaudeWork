"use client"

import { useEffect, useState } from "react"
import { toast } from "sonner"
import { Loader2, CreditCard, CheckCircle2, ExternalLink, Link2 } from "lucide-react"

type Status = {
  connected: boolean
  chargesEnabled: boolean
  detailsSubmitted?: boolean
  linkedExisting?: boolean
  canLinkExisting?: boolean
}

// Lets a firm connect their own Stripe account so client deposits pay them directly —
// either a new account set up through us (Express) or one they already have (OAuth).
export function StripeConnect() {
  const [status, setStatus] = useState<Status | null>(null)
  const [busy, setBusy] = useState(false)

  const load = () =>
    fetch("/api/stripe/connect")
      .then((r) => r.json())
      .then((d) => setStatus(d))
      .catch(() => setStatus({ connected: false, chargesEnabled: false }))
  useEffect(() => { load() }, [])

  // Toast on return from linking an existing account (?stripe=linked|error|…).
  useEffect(() => {
    const params = new URLSearchParams(window.location.search)
    const p = params.get("stripe")
    if (!p || p === "refresh" || p === "return") return
    const why = params.get("why")
    if (p === "linked") toast.success("Stripe account linked — deposits will pay into it")
    else if (p === "linked-pending")
      toast.warning("Stripe account linked, but it can't take payments yet — finish setup in your Stripe dashboard", { duration: 12000 })
    else if (p === "error")
      toast.error(why ? `Couldn't link Stripe: ${why}` : "Couldn't link Stripe — please try again", { duration: 12000 })
    else if (p === "forbidden") toast.error("Only an owner or admin can link a Stripe account")
    else if (p === "unavailable") toast.error("Linking an existing Stripe account isn't configured on the server yet")
    window.history.replaceState({}, "", window.location.pathname)
    load()
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

  const linkExisting = (replacing: boolean) => {
    if (replacing && !confirm(
      "Link a different Stripe account? New deposits will pay into that account instead. " +
      "Anything already in the current account stays there and still pays out as normal."
    )) return
    window.location.href = "/api/stripe/oauth/start"
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
              {status.linkedExisting
                ? "Client deposits go straight into your existing Stripe account and pay out to your bank."
                : "Client deposits go straight into your own Stripe account and pay out to your bank."}
            </p>
            <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1">
              <button onClick={start} disabled={busy}
                className="inline-flex items-center gap-1.5 text-xs text-gray-500 hover:text-brand-blue">
                {busy ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <ExternalLink className="w-3.5 h-3.5" />}
                {status.linkedExisting ? "Open your Stripe dashboard" : "Manage / update Stripe details"}
              </button>
              {status.canLinkExisting && (
                <button onClick={() => linkExisting(true)}
                  className="inline-flex items-center gap-1.5 text-xs text-gray-500 hover:text-brand-blue">
                  <Link2 className="w-3.5 h-3.5" />
                  Use a different Stripe account
                </button>
              )}
            </div>
          </div>
        </div>
      ) : (
        <div className="space-y-3">
          <p className="text-sm text-gray-500">
            {status.connected
              ? status.linkedExisting
                ? "Your linked Stripe account can't take payments yet — finish its setup in your Stripe dashboard."
                : "Your Stripe setup isn't finished yet — complete it so you can take deposits."
              : "Connect Stripe so client deposits are paid straight to you (rather than held centrally). Takes a few minutes."}
          </p>
          <div className="flex flex-wrap items-center gap-3">
            <button onClick={start} disabled={busy}
              className="inline-flex items-center gap-2 px-4 py-2 bg-brand-blue text-white rounded-lg text-sm font-semibold hover:bg-blue-700 disabled:opacity-50">
              {busy ? <Loader2 className="w-4 h-4 animate-spin" /> : <CreditCard className="w-4 h-4" />}
              {status.connected
                ? status.linkedExisting ? "Open Stripe dashboard" : "Finish Stripe setup"
                : "Set up a new Stripe account"}
            </button>
            {status.canLinkExisting && (
              <button onClick={() => linkExisting(status.connected)}
                className="inline-flex items-center gap-2 px-4 py-2 border border-brand-blue text-brand-blue rounded-lg text-sm font-semibold hover:bg-blue-50">
                <Link2 className="w-4 h-4" />
                {status.connected ? "Link a different Stripe account" : "I already have a Stripe account"}
              </button>
            )}
          </div>
        </div>
      )}
    </section>
  )
}
