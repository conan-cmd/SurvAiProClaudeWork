"use client"

import { useEffect, useState } from "react"
import { toast } from "sonner"
import { Loader2, Check, Plug, RefreshCw } from "lucide-react"

type Status = { connected: boolean; customerId: string | null; jobTypeName: string | null }
type JobType = { id: number; name: string }

// Owner/admin connects the firm's BigChange (JobWatch) account. Booked
// "survey" jobs in BigChange then sync into SurvAIPro as scheduled surveys.
export function BigChangeConnect() {
  const [status, setStatus] = useState<Status | null>(null)
  const [clientId, setClientId] = useState("")
  const [clientSecret, setClientSecret] = useState("")
  const [customerId, setCustomerId] = useState("")
  const [jobTypes, setJobTypes] = useState<JobType[] | null>(null)
  const [busy, setBusy] = useState(false)
  const [syncing, setSyncing] = useState(false)

  const load = () =>
    fetch("/api/organization/bigchange").then((r) => r.json()).then(setStatus).catch(() => setStatus(null))
  useEffect(() => { load() }, [])

  const inputCls =
    "w-full border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-blue/30"

  const save = async (extra?: { jobTypeId: number; jobTypeName: string }) => {
    setBusy(true)
    try {
      const res = await fetch("/api/organization/bigchange", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ...(clientId.trim() ? { clientId: clientId.trim() } : {}),
          ...(clientSecret.trim() ? { clientSecret: clientSecret.trim() } : {}),
          ...(customerId.trim() ? { customerId: customerId.trim() } : {}),
          ...(extra || {}),
        }),
      })
      if (!res.ok) throw new Error((await res.json()).error)
      setClientSecret("")
      await load()
      return true
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Couldn't save BigChange settings")
      return false
    } finally {
      setBusy(false)
    }
  }

  const connectAndTest = async () => {
    if (!(await save())) return
    setBusy(true)
    try {
      const res = await fetch("/api/bigchange/job-types")
      const json = await res.json()
      if (!res.ok) throw new Error(json.error)
      setJobTypes(json.jobTypes)
      toast.success("Connected to BigChange — now pick your survey job type")
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Couldn't reach BigChange", { duration: 12000 })
    } finally {
      setBusy(false)
    }
  }

  const pickJobType = async (t: JobType) => {
    if (await save({ jobTypeId: t.id, jobTypeName: t.name })) {
      setJobTypes(null)
      toast.success(`Survey bookings will sync from "${t.name}" jobs`)
    }
  }

  const sync = async () => {
    setSyncing(true)
    try {
      const res = await fetch("/api/bigchange/sync", { method: "POST" })
      const json = await res.json()
      if (!res.ok) throw new Error(json.error)
      toast.success(
        json.imported
          ? `Imported ${json.imported} booking${json.imported === 1 ? "" : "s"} (${json.skipped} already in)`
          : `No new bookings — ${json.fetched} checked, ${json.skipped} already in`,
        { duration: 8000 }
      )
      if (json.debugKeys) console.info("BigChange job fields:", json.debugKeys)
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Sync failed", { duration: 12000 })
    } finally {
      setSyncing(false)
    }
  }

  const disconnect = async () => {
    if (!confirm("Disconnect BigChange? Survey bookings will stop syncing.")) return
    setBusy(true)
    try {
      const res = await fetch("/api/organization/bigchange", { method: "DELETE" })
      if (!res.ok) throw new Error((await res.json()).error)
      setJobTypes(null)
      toast.success("BigChange disconnected")
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
            <Check className="w-4 h-4" /> Connected (customer {status.customerId})
            {status.jobTypeName && <span className="text-gray-500 font-normal">· syncing &quot;{status.jobTypeName}&quot; jobs</span>}
          </div>
          {!status.jobTypeName && !jobTypes && (
            <button onClick={async () => {
              const res = await fetch("/api/bigchange/job-types")
              const json = await res.json()
              if (res.ok) setJobTypes(json.jobTypes)
              else toast.error(json.error, { duration: 12000 })
            }} className="text-sm font-medium text-brand-blue hover:underline">
              Choose which job type is a survey booking
            </button>
          )}
          {jobTypes && (
            <div className="flex flex-wrap gap-2">
              {jobTypes.map((t) => (
                <button key={t.id} onClick={() => pickJobType(t)} disabled={busy}
                  className="px-3 py-1.5 border rounded-full text-xs font-medium hover:bg-gray-50 disabled:opacity-50">
                  {t.name}
                </button>
              ))}
              {!jobTypes.length && <p className="text-xs text-amber-600">No job types found on this account.</p>}
            </div>
          )}
          <div className="flex items-center gap-4">
            <button onClick={sync} disabled={syncing || !status.jobTypeName}
              className="inline-flex items-center gap-2 px-4 py-2 bg-brand-navy text-white rounded-lg text-sm font-semibold hover:opacity-90 disabled:opacity-50">
              {syncing ? <Loader2 className="w-4 h-4 animate-spin" /> : <RefreshCw className="w-4 h-4" />}
              {syncing ? "Syncing…" : "Sync bookings now"}
            </button>
            {status.jobTypeName && (
              <button onClick={() => {
                fetch("/api/bigchange/job-types").then((r) => r.json()).then((j) => j.jobTypes && setJobTypes(j.jobTypes))
              }} className="text-xs font-medium text-gray-500 hover:underline">
                Change job type
              </button>
            )}
            <button onClick={disconnect} disabled={busy}
              className="text-xs font-medium text-red-600 hover:underline disabled:opacity-50">
              Disconnect
            </button>
          </div>
          <p className="text-xs text-gray-500">
            Booked jobs of your chosen type come in as scheduled surveys (no duplicates on re-sync).
          </p>
        </>
      ) : (
        <>
          <p className="text-sm text-gray-600">
            Connect BigChange and your booked survey jobs appear in SurvAIPro automatically,
            scheduled and ready for the surveyor. Create an API key in the BigChange Developer
            Portal (Account → Manage API Keys) and paste the details here — they&apos;re stored encrypted.
          </p>
          <div className="grid sm:grid-cols-3 gap-2">
            <input className={inputCls} placeholder="Client ID" value={clientId}
              onChange={(e) => setClientId(e.target.value)} autoComplete="off" />
            <input className={inputCls} placeholder="Client Secret" type="password" value={clientSecret}
              onChange={(e) => setClientSecret(e.target.value)} autoComplete="new-password" />
            <input className={inputCls} placeholder="Customer ID (number)" value={customerId}
              onChange={(e) => setCustomerId(e.target.value)} autoComplete="off" />
          </div>
          <button onClick={connectAndTest} disabled={busy || !clientId.trim() || !clientSecret.trim() || !customerId.trim()}
            className="inline-flex items-center gap-2 px-4 py-2 bg-[#F97316] text-white rounded-lg text-sm font-semibold hover:brightness-95 disabled:opacity-50">
            {busy ? <Loader2 className="w-4 h-4 animate-spin" /> : <Plug className="w-4 h-4" />}
            Connect &amp; test
          </button>
        </>
      )}
    </div>
  )
}
