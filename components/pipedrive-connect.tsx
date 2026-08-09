"use client"

import { useEffect, useState } from "react"
import { toast } from "sonner"
import { Loader2, Check, Plug } from "lucide-react"

type Status = { connected: boolean; companyDomain: string | null }

// Owner/admin connects the firm's own Pipedrive (API token + company domain).
export function PipedriveConnect() {
  const [status, setStatus] = useState<Status | null>(null)
  const [token, setToken] = useState("")
  const [domain, setDomain] = useState("")
  const [busy, setBusy] = useState(false)

  const load = () =>
    fetch("/api/organization/pipedrive")
      .then((r) => r.json())
      .then(setStatus)
      .catch(() => setStatus({ connected: false, companyDomain: null }))
  useEffect(() => { load() }, [])

  const connect = async () => {
    setBusy(true)
    try {
      const res = await fetch("/api/organization/pipedrive", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ apiToken: token.trim(), companyDomain: domain.trim() }),
      })
      const d = await res.json()
      if (!res.ok) throw new Error(d.error)
      setToken("")
      setDomain("")
      setStatus({ connected: true, companyDomain: d.companyDomain })
      toast.success(`Connected to Pipedrive${d.userName ? ` as ${d.userName}` : ""}`)
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Couldn't connect")
    } finally {
      setBusy(false)
    }
  }

  const disconnect = async () => {
    if (!confirm("Disconnect Pipedrive? Proposals will stop syncing to deals.")) return
    setBusy(true)
    try {
      const res = await fetch("/api/organization/pipedrive", { method: "DELETE" })
      if (!res.ok) throw new Error((await res.json()).error)
      setStatus({ connected: false, companyDomain: null })
      toast.success("Pipedrive disconnected")
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Couldn't disconnect")
    } finally {
      setBusy(false)
    }
  }

  const inputCls = "w-full px-3 py-2 border rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-brand-blue"

  return (
    <section className="bg-white rounded-xl shadow-sm p-5 space-y-3">
      <h2 className="font-semibold text-brand-navy">Pipedrive CRM</h2>
      {status?.connected ? (
        <>
          <p className="text-sm text-gray-600 inline-flex items-center gap-1.5">
            <Check className="w-4 h-4 text-emerald-600" />
            Connected{status.companyDomain ? ` — ${status.companyDomain}.pipedrive.com` : ""}
          </p>
          <p className="text-xs text-gray-500">
            Proposals sync to deals automatically — a deal is created when you send a proposal, its value tracks your price, and it&apos;s marked <strong>won</strong> when the client accepts (or <strong>lost</strong> if you mark the proposal lost). You can also import a Pipedrive contact when starting a new survey.
          </p>
          <button onClick={disconnect} disabled={busy}
            className="inline-flex items-center gap-1.5 px-3 py-2 border rounded-lg text-sm font-medium hover:bg-gray-50 disabled:opacity-50">
            {busy ? <Loader2 className="w-4 h-4 animate-spin" /> : null} Disconnect
          </button>
        </>
      ) : (
        <>
          <p className="text-sm text-gray-500">
            Connect Pipedrive to auto-create deals from your proposals and import contacts. Get an API token in Pipedrive → <em>Settings → Personal preferences → API</em>.
          </p>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Company domain</label>
            <input className={inputCls} value={domain} onChange={(e) => setDomain(e.target.value)}
              placeholder="yourcompany  (from yourcompany.pipedrive.com)" />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">API token</label>
            <input className={inputCls} value={token} onChange={(e) => setToken(e.target.value)}
              placeholder="Your Pipedrive API token" />
          </div>
          <button onClick={connect} disabled={busy || !token.trim() || !domain.trim()}
            className="inline-flex items-center gap-1.5 px-4 py-2 bg-brand-blue text-white rounded-lg text-sm font-semibold hover:bg-blue-700 disabled:opacity-50">
            {busy ? <Loader2 className="w-4 h-4 animate-spin" /> : <Plug className="w-4 h-4" />} Connect Pipedrive
          </button>
        </>
      )}
    </section>
  )
}
