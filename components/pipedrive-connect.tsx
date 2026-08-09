"use client"

import { useEffect, useState } from "react"
import { toast } from "sonner"
import { Loader2, Check, Plug } from "lucide-react"

type Status = {
  connected: boolean
  mode: "oauth" | "token" | null
  oauthAvailable: boolean
  companyDomain: string | null
  apiDomain: string | null
}

// Owner/admin connects the firm's own Pipedrive — one-click OAuth (Marketplace)
// when the app is configured, else an API-token fallback for private connections.
export function PipedriveConnect() {
  const [status, setStatus] = useState<Status | null>(null)
  const [token, setToken] = useState("")
  const [domain, setDomain] = useState("")
  const [busy, setBusy] = useState(false)
  const [showToken, setShowToken] = useState(false)

  const load = () =>
    fetch("/api/organization/pipedrive").then((r) => r.json()).then(setStatus).catch(() => setStatus(null))
  useEffect(() => { load() }, [])

  // Toast on return from the OAuth redirect (?pipedrive=connected|error|…).
  useEffect(() => {
    const p = new URLSearchParams(window.location.search).get("pipedrive")
    if (!p) return
    if (p === "connected") toast.success("Pipedrive connected")
    else if (p === "error") toast.error("Couldn't connect Pipedrive — please try again")
    else if (p === "forbidden") toast.error("Only an owner or admin can connect Pipedrive")
    else if (p === "unavailable") toast.error("One-click Pipedrive connect isn't configured on the server yet")
    window.history.replaceState({}, "", window.location.pathname)
    load()
  }, [])

  const connectToken = async () => {
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
      toast.success(`Connected to Pipedrive${d.userName ? ` as ${d.userName}` : ""}`)
      load()
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
      toast.success("Pipedrive disconnected")
      load()
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
            Connected{status.companyDomain ? ` — ${status.companyDomain}.pipedrive.com` : status.apiDomain ? ` — ${status.apiDomain.replace(/^https?:\/\//, "")}` : ""}
            {status.mode === "token" ? " (API token)" : ""}
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
            Connect Pipedrive to auto-create deals from your proposals and import contacts.
          </p>

          {status?.oauthAvailable && (
            <a href="/api/pipedrive/oauth/start"
              className="inline-flex items-center gap-1.5 px-4 py-2 bg-brand-blue text-white rounded-lg text-sm font-semibold hover:bg-blue-700">
              <Plug className="w-4 h-4" /> Connect with Pipedrive
            </a>
          )}

          {/* API-token fallback (private connections / before the Marketplace app is live) */}
          {status && (!status.oauthAvailable || showToken) ? (
            <div className="space-y-3 pt-1">
              {status.oauthAvailable && <div className="text-xs text-gray-400">Or connect with an API token:</div>}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Company domain</label>
                <input className={inputCls} value={domain} onChange={(e) => setDomain(e.target.value)}
                  placeholder="yourcompany  (from yourcompany.pipedrive.com)" />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">API token</label>
                <input className={inputCls} value={token} onChange={(e) => setToken(e.target.value)}
                  placeholder="Pipedrive → Settings → Personal preferences → API" />
              </div>
              <button onClick={connectToken} disabled={busy || !token.trim() || !domain.trim()}
                className="inline-flex items-center gap-1.5 px-4 py-2 border rounded-lg text-sm font-semibold hover:bg-gray-50 disabled:opacity-50">
                {busy ? <Loader2 className="w-4 h-4 animate-spin" /> : null} Connect with token
              </button>
            </div>
          ) : status?.oauthAvailable ? (
            <button onClick={() => setShowToken(true)} className="block text-xs text-gray-400 hover:text-gray-600 underline">
              Use an API token instead
            </button>
          ) : null}
        </>
      )}
    </section>
  )
}
