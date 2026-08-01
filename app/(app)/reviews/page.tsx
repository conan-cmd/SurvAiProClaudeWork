"use client"

import { useEffect, useState } from "react"
import Link from "next/link"
import { toast } from "sonner"
import { Loader2, ShieldCheck, ClipboardCheck, ExternalLink, Clock } from "lucide-react"

type Item = {
  id: string
  clientName: string
  title: string
  address: string
  submittedAt: string | null
  submittedBy: string
}

export default function ReviewsPage() {
  const [items, setItems] = useState<Item[] | null>(null)
  const [busy, setBusy] = useState<string | null>(null)

  const load = () =>
    fetch("/api/proposals/review-queue")
      .then((r) => r.json())
      .then((d) => setItems(d.proposals || []))
      .catch(() => setItems([]))

  useEffect(() => { load() }, [])

  const review = async (id: string, decision: "approve" | "changes") => {
    let note: string | undefined
    if (decision === "changes") {
      note = window.prompt("What needs changing? (the drafter will see this note)") || undefined
      if (note === undefined) return
    }
    setBusy(id)
    try {
      const res = await fetch(`/api/proposals/${id}/review`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ decision, note }),
      })
      const d = await res.json()
      if (!res.ok) throw new Error(d.error)
      setItems((prev) => (prev ? prev.filter((p) => p.id !== id) : prev))
      toast.success(decision === "approve" ? "Approved — ready to send" : "Sent back with your notes")
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Couldn't complete the review")
    } finally {
      setBusy(null)
    }
  }

  const when = (iso: string | null) => {
    if (!iso) return ""
    const mins = Math.round((Date.now() - new Date(iso).getTime()) / 60000)
    if (mins < 1) return "just now"
    if (mins < 60) return `${mins}m ago`
    const hrs = Math.round(mins / 60)
    if (hrs < 24) return `${hrs}h ago`
    return `${Math.round(hrs / 24)}d ago`
  }

  return (
    <div className="max-w-3xl mx-auto space-y-5">
      <div>
        <h1 className="text-xl font-bold text-brand-navy">Proposals to review</h1>
        <p className="text-sm text-gray-500">Sign off proposals your team has drafted before they go to clients.</p>
      </div>

      {items === null ? (
        <div className="flex justify-center py-20"><Loader2 className="w-8 h-8 animate-spin text-brand-blue" /></div>
      ) : items.length === 0 ? (
        <div className="bg-white rounded-xl shadow-sm p-10 text-center text-gray-500">
          <ShieldCheck className="w-10 h-10 mx-auto mb-3 text-emerald-500" />
          Nothing waiting for review. You&apos;re all caught up.
        </div>
      ) : (
        <div className="space-y-3">
          {items.map((p) => (
            <div key={p.id} className="bg-white rounded-xl shadow-sm p-4">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div className="min-w-0">
                  <div className="font-semibold text-brand-navy truncate">{p.clientName}</div>
                  <div className="text-sm text-gray-500 truncate">{p.title}</div>
                  <div className="text-xs text-gray-400 truncate">{p.address}</div>
                  <div className="mt-1 inline-flex items-center gap-1 text-xs text-gray-400">
                    <Clock className="w-3 h-3" /> from {p.submittedBy} · {when(p.submittedAt)}
                  </div>
                </div>
                <div className="flex flex-wrap items-center gap-2">
                  <Link href={`/proposals/${p.id}`}
                    className="inline-flex items-center gap-1.5 px-3 py-2 border rounded-lg text-sm font-medium bg-white hover:bg-gray-50">
                    <ExternalLink className="w-4 h-4" /> Open
                  </Link>
                  <button onClick={() => review(p.id, "changes")} disabled={busy === p.id}
                    className="inline-flex items-center gap-1.5 px-3 py-2 border border-amber-300 text-amber-700 bg-amber-50 rounded-lg text-sm font-medium hover:bg-amber-100 disabled:opacity-50">
                    Request changes
                  </button>
                  <button onClick={() => review(p.id, "approve")} disabled={busy === p.id}
                    className="inline-flex items-center gap-1.5 px-3 py-2 bg-emerald-600 text-white rounded-lg text-sm font-semibold hover:bg-emerald-700 disabled:opacity-50">
                    {busy === p.id ? <Loader2 className="w-4 h-4 animate-spin" /> : <ClipboardCheck className="w-4 h-4" />} Approve
                  </button>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
