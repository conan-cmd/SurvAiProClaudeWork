"use client"

import { useEffect, useState } from "react"
import { toast } from "sonner"
import { Loader2, Plus, Copy, Trash2, Check } from "lucide-react"

type Code = {
  id: string
  code: string
  label: string | null
  active: boolean
  maxUses: number
  uses: number
  activeGrants: number
  createdAt: string
}

export function CodesManager() {
  const [codes, setCodes] = useState<Code[] | null>(null)
  const [label, setLabel] = useState("")
  const [maxUses, setMaxUses] = useState(1)
  const [busy, setBusy] = useState(false)
  const [copied, setCopied] = useState<string | null>(null)

  const load = () => fetch("/api/admin/codes").then((r) => r.json()).then(setCodes).catch(() => setCodes([]))
  useEffect(() => { load() }, [])

  const create = async () => {
    setBusy(true)
    try {
      const res = await fetch("/api/admin/codes", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ label: label.trim() || undefined, maxUses }),
      })
      const d = await res.json()
      if (!res.ok) throw new Error(d.error)
      setLabel("")
      setMaxUses(1)
      setCodes((c) => [{ ...d, activeGrants: 0 }, ...(c || [])])
      toast.success(`Created ${d.code}`)
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Couldn't create code")
    } finally {
      setBusy(false)
    }
  }

  const revoke = async (id: string, code: string) => {
    if (!confirm(`Revoke ${code}? Anyone using it loses access immediately.`)) return
    try {
      const res = await fetch(`/api/admin/codes/${id}`, { method: "DELETE" })
      if (!res.ok) throw new Error((await res.json()).error)
      setCodes((c) => (c || []).map((x) => (x.id === id ? { ...x, active: false, activeGrants: 0 } : x)))
      toast.success("Revoked")
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Couldn't revoke")
    }
  }

  const copy = async (code: string) => {
    try {
      await navigator.clipboard.writeText(code)
      setCopied(code)
      setTimeout(() => setCopied(null), 1500)
    } catch {
      toast.error("Copy failed")
    }
  }

  return (
    <div className="space-y-5">
      <section className="bg-white rounded-xl shadow-sm p-5 space-y-3">
        <h2 className="font-semibold text-brand-navy">Create a code</h2>
        <div className="grid sm:grid-cols-[1fr_auto_auto] gap-2">
          <input value={label} onChange={(e) => setLabel(e.target.value)}
            placeholder="Who's it for? (e.g. Dave – roofing tester)"
            className="px-3 py-2 border rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-brand-blue" />
          <select value={maxUses} onChange={(e) => setMaxUses(Number(e.target.value))}
            className="px-2 py-2 border rounded-lg text-sm">
            <option value={1}>1 use</option>
            <option value={5}>5 uses</option>
            <option value={10}>10 uses</option>
            <option value={25}>25 uses</option>
          </select>
          <button onClick={create} disabled={busy}
            className="inline-flex items-center gap-1.5 px-4 py-2 bg-brand-blue text-white rounded-lg text-sm font-semibold hover:bg-blue-700 disabled:opacity-50">
            {busy ? <Loader2 className="w-4 h-4 animate-spin" /> : <Plus className="w-4 h-4" />} Create
          </button>
        </div>
        <p className="text-xs text-gray-400">
          A tester signs up as normal, then enters the code on the paywall to get free access.
        </p>
      </section>

      <section className="bg-white rounded-xl shadow-sm p-2">
        {codes === null ? (
          <div className="flex items-center gap-2 text-gray-400 text-sm p-4"><Loader2 className="w-4 h-4 animate-spin" /> Loading…</div>
        ) : codes.length === 0 ? (
          <p className="text-sm text-gray-400 p-4">No codes yet.</p>
        ) : (
          <div className="divide-y">
            {codes.map((c) => (
              <div key={c.id} className="flex items-center gap-3 p-3">
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <span className={`font-mono font-semibold ${c.active ? "text-brand-navy" : "text-gray-400 line-through"}`}>{c.code}</span>
                    <button onClick={() => copy(c.code)} className="text-gray-400 hover:text-brand-blue" aria-label="Copy">
                      {copied === c.code ? <Check className="w-3.5 h-3.5 text-emerald-600" /> : <Copy className="w-3.5 h-3.5" />}
                    </button>
                    {!c.active && <span className="text-[11px] text-red-500 font-medium">revoked</span>}
                  </div>
                  <div className="text-xs text-gray-500 truncate">
                    {c.label || "—"} · {c.uses}/{c.maxUses} used · {c.activeGrants} active
                  </div>
                </div>
                {c.active && (
                  <button onClick={() => revoke(c.id, c.code)} className="p-1.5 text-gray-300 hover:text-red-600" aria-label="Revoke">
                    <Trash2 className="w-4 h-4" />
                  </button>
                )}
              </div>
            ))}
          </div>
        )}
      </section>
    </div>
  )
}
