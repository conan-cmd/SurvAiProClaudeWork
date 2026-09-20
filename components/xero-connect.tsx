"use client"

import { useEffect, useState } from "react"
import { toast } from "sonner"
import { Loader2, Check, Plug } from "lucide-react"

type Status = {
  available: boolean
  connected: boolean
  tenantName: string | null
}

// Owner/admin connects the firm's Xero. Once connected, a draft deposit
// invoice is raised in Xero automatically whenever a client pays a deposit.
export function XeroConnect() {
  const [status, setStatus] = useState<Status | null>(null)
  const [busy, setBusy] = useState(false)

  const load = () =>
    fetch("/api/organization/xero").then((r) => r.json()).then(setStatus).catch(() => setStatus(null))
  useEffect(() => { load() }, [])

  // Toast on return from the OAuth redirect (?xero=connected|error|…).
  useEffect(() => {
    const p = new URLSearchParams(window.location.search).get("xero")
    if (!p) return
    if (p === "connected") toast.success("Xero connected")
    else if (p === "error") toast.error("Couldn't connect Xero — please try again")
    else if (p === "forbidden") toast.error("Only an owner or admin can connect Xero")
    else if (p === "unavailable") toast.error("Xero connect isn't configured on the server yet")
    window.history.replaceState({}, "", window.location.pathname)
    load()
  }, [])

  const disconnect = async () => {
    if (!confirm("Disconnect Xero? Deposit invoices will stop being created automatically.")) return
    setBusy(true)
    try {
      const res = await fetch("/api/organization/xero", { method: "DELETE" })
      if (!res.ok) throw new Error((await res.json()).error)
      toast.success("Xero disconnected")
      load()
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Couldn't disconnect")
    } finally {
      setBusy(false)
    }
  }

  if (!status) {
    return <div className="flex items-center gap-2 text-sm text-gray-400"><Loader2 className="w-4 h-4 animate-spin" /> Loading…</div>
  }

  return (
    <div className="space-y-3">
      {status.connected ? (
        <>
          <div className="flex items-center gap-2 text-sm text-emerald-700 font-medium">
            <Check className="w-4 h-4" /> Connected to {status.tenantName || "Xero"}
          </div>
          <p className="text-xs text-gray-500">
            When a client pays their deposit through SurvAIPro, a draft deposit invoice
            (VAT-inclusive, referencing the job) is created in Xero ready to approve and
            match against the Stripe payout.
          </p>
          <button onClick={disconnect} disabled={busy}
            className="text-xs font-medium text-red-600 hover:underline disabled:opacity-50">
            Disconnect Xero
          </button>
        </>
      ) : (
        <>
          <p className="text-sm text-gray-600">
            Connect Xero and SurvAIPro will raise a draft deposit invoice automatically
            whenever a client pays a deposit — the office just approves it.
          </p>
          <a href="/api/xero/oauth/start"
            className="inline-flex items-center gap-2 px-4 py-2 bg-[#13B5EA] text-white rounded-lg text-sm font-semibold hover:brightness-95">
            <Plug className="w-4 h-4" /> Connect Xero
          </a>
          {!status.available && (
            <p className="text-xs text-amber-600">
              Xero isn&apos;t configured on the server yet (XERO_CLIENT_ID/SECRET).
            </p>
          )}
        </>
      )}
    </div>
  )
}
