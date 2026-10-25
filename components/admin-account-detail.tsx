"use client"

import { useEffect, useState } from "react"
import { createPortal } from "react-dom"
import { toast } from "sonner"
import { X, Loader2, Send, Check, Minus } from "lucide-react"

type Detail = {
  name: string
  contact: { email: string | null; phone: string | null; website: string | null }
  createdAt: string
  hasBranding: boolean
  hasServices: boolean
  team: { name: string | null; email: string; role: string; lastActiveAt: string | null; gmailConnected: boolean; joinedAt: string }[]
  counts: { surveys: number; proposals: number; rams: number; jobReports: number; testimonials: number }
  pipeline: {
    byStatus: Record<string, number>
    won: number
    winRate: number | null
    wonValue: number
    depositsPaid: number
    depositsValue: number
    lastProposalAt: string | null
    lastSentAt: string | null
  }
  integrations: {
    stripePayments: boolean
    pipedrive: boolean
    xero: boolean
    xeroTenantName: string | null
    bigchange: boolean
    googleReviews: boolean
  }
}

const gbp = (n: number) => "£" + n.toLocaleString("en-GB", { maximumFractionDigits: 0 })
const rel = (d: string | null) => {
  if (!d) return "never"
  const mins = Math.round((Date.now() - new Date(d).getTime()) / 60000)
  if (mins < 60) return `${Math.max(mins, 1)}m ago`
  if (mins < 1440) return `${Math.round(mins / 60)}h ago`
  return `${Math.round(mins / 1440)}d ago`
}

// Account drill-down on the admin usage table: click the name to see the
// detail and email the owner a custom message without leaving the page.
export function AdminAccountDetail({ orgId, name, ownerEmail }: { orgId: string; name: string; ownerEmail: string | null }) {
  const [open, setOpen] = useState(false)
  const [detail, setDetail] = useState<Detail | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [to, setTo] = useState(ownerEmail || "")
  const [subject, setSubject] = useState("")
  const [message, setMessage] = useState("")
  const [sending, setSending] = useState(false)

  useEffect(() => {
    if (!open || detail) return
    fetch(`/api/admin/accounts/${orgId}`)
      .then(async (r) => {
        const d = await r.json()
        if (!r.ok) throw new Error(d.error)
        setDetail(d)
      })
      .catch((e) => setError(e instanceof Error ? e.message : "Couldn't load the account"))
  }, [open, detail, orgId])

  const send = async () => {
    setSending(true)
    try {
      const res = await fetch(`/api/admin/accounts/${orgId}/email`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ to, subject, message }),
      })
      const d = await res.json()
      if (!res.ok) throw new Error(d.error)
      toast.success("Email sent")
      setSubject("")
      setMessage("")
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Couldn't send")
    } finally {
      setSending(false)
    }
  }

  const flag = (on: boolean, label: string, extra?: string | null) => (
    <span className={`inline-flex items-center gap-1 text-xs font-medium px-2 py-1 rounded-full border ${
      on ? "bg-emerald-50 text-emerald-700 border-emerald-200" : "bg-gray-50 text-gray-400 border-gray-200"
    }`}>
      {on ? <Check className="w-3 h-3" /> : <Minus className="w-3 h-3" />}
      {label}{on && extra ? ` · ${extra}` : ""}
    </span>
  )

  return (
    <>
      <button type="button" onClick={() => setOpen(true)}
        className="font-medium text-gray-900 hover:text-brand-blue hover:underline text-left">
        {name}
      </button>
      {open && createPortal(
        <div className="fixed inset-0 z-50 bg-black/40 flex items-end sm:items-center justify-center p-4 overscroll-contain"
          onClick={() => setOpen(false)}>
          <div className="bg-white rounded-xl shadow-xl w-full max-w-lg p-5 space-y-4 max-h-[88dvh] overflow-y-auto overscroll-contain"
            onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between">
              <h3 className="font-bold text-brand-navy">{name}</h3>
              <button onClick={() => setOpen(false)} aria-label="Close"
                className="p-1 text-gray-400 hover:text-gray-600"><X className="w-4 h-4" /></button>
            </div>

            {error ? (
              <p className="text-sm text-amber-600">{error}</p>
            ) : !detail ? (
              <div className="flex items-center gap-2 text-gray-400 text-sm py-4">
                <Loader2 className="w-4 h-4 animate-spin" /> Loading account…
              </div>
            ) : (
              <>
                <div className="text-sm text-gray-600 space-y-0.5">
                  {detail.contact.email && <div>✉️ <a className="text-brand-blue hover:underline" href={`mailto:${detail.contact.email}`}>{detail.contact.email}</a></div>}
                  {detail.contact.phone && <div>📞 <a className="text-brand-blue hover:underline" href={`tel:${detail.contact.phone}`}>{detail.contact.phone}</a></div>}
                  {detail.contact.website && <div>🌐 <a className="text-brand-blue hover:underline" href={detail.contact.website} target="_blank" rel="noopener noreferrer">{detail.contact.website}</a></div>}
                  <div className="text-xs text-gray-400">
                    Joined {new Date(detail.createdAt).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" })}
                    {" "}· {detail.hasBranding ? "logo set" : "no logo yet"} · {detail.hasServices ? "services set" : "no services yet"}
                  </div>
                </div>

                <div className="bg-gray-50 border rounded-lg p-3 text-sm space-y-1.5">
                  <p className="text-xs font-semibold text-gray-500">Pipeline</p>
                  <div className="flex flex-wrap gap-x-4 gap-y-1 text-gray-700">
                    <span>{detail.counts.surveys} surveys</span>
                    <span>{detail.counts.proposals} proposals</span>
                    <span>{detail.counts.rams} RAMS</span>
                    <span>{detail.counts.jobReports} job reports</span>
                  </div>
                  <div className="flex flex-wrap gap-1.5 pt-0.5">
                    {Object.entries(detail.pipeline.byStatus).map(([s, n]) => (
                      <span key={s} className="text-xs px-2 py-0.5 rounded-full bg-white border text-gray-600">{s} ×{n}</span>
                    ))}
                  </div>
                  <div className="text-xs text-gray-500">
                    {detail.pipeline.won} won{detail.pipeline.winRate != null ? ` (${detail.pipeline.winRate}% of decided)` : ""}
                    {detail.pipeline.wonValue > 0 && <> · {gbp(detail.pipeline.wonValue)} won value</>}
                    {detail.pipeline.depositsPaid > 0 && <> · {detail.pipeline.depositsPaid} deposits ({gbp(detail.pipeline.depositsValue)})</>}
                    <br />
                    Last proposal created {rel(detail.pipeline.lastProposalAt)} · last sent {rel(detail.pipeline.lastSentAt)}
                  </div>
                </div>

                <div className="space-y-1.5">
                  <p className="text-xs font-semibold text-gray-500">Team ({detail.team.length})</p>
                  <ul className="text-sm text-gray-700 space-y-0.5">
                    {detail.team.map((u) => (
                      <li key={u.email} className="flex flex-wrap items-center gap-x-2">
                        <span className="font-medium">{u.name || u.email}</span>
                        <span className="text-xs text-gray-400">{u.role.toLowerCase()} · active {rel(u.lastActiveAt)}{u.gmailConnected ? " · Gmail ✓" : ""}</span>
                      </li>
                    ))}
                  </ul>
                </div>

                <div className="flex flex-wrap gap-1.5">
                  {flag(detail.integrations.stripePayments, "Stripe payments")}
                  {flag(detail.integrations.pipedrive, "Pipedrive")}
                  {flag(detail.integrations.xero, "Xero", detail.integrations.xeroTenantName)}
                  {flag(detail.integrations.bigchange, "BigChange")}
                  {flag(detail.integrations.googleReviews, "Google reviews")}
                </div>

                <div className="border-t pt-3 space-y-2">
                  <p className="text-sm font-medium text-gray-700">Email this account</p>
                  <input value={to} onChange={(e) => setTo(e.target.value)} placeholder="recipient@company.co.uk"
                    className="w-full text-sm px-3 py-2 border rounded-lg focus:outline-none focus:ring-2 focus:ring-brand-blue" />
                  <input value={subject} onChange={(e) => setSubject(e.target.value)} placeholder="Subject"
                    className="w-full text-sm px-3 py-2 border rounded-lg focus:outline-none focus:ring-2 focus:ring-brand-blue" />
                  <textarea spellCheck rows={4} value={message} onChange={(e) => setMessage(e.target.value)}
                    placeholder="Write your message — it signs off with your name, and replies come to your inbox."
                    className="w-full text-sm px-3 py-2 border rounded-lg focus:outline-none focus:ring-2 focus:ring-brand-blue" />
                  <div className="flex justify-end">
                    <button onClick={send} disabled={sending || !to.trim() || !subject.trim() || !message.trim()}
                      className="inline-flex items-center gap-2 px-4 py-2 bg-brand-blue text-white rounded-lg text-sm font-semibold hover:bg-blue-700 disabled:opacity-50">
                      {sending ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
                      Send email
                    </button>
                  </div>
                </div>
              </>
            )}
          </div>
        </div>,
        document.body
      )}
    </>
  )
}
