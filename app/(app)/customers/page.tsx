import Link from "next/link"
import { redirect } from "next/navigation"
import { Users } from "lucide-react"
import { db } from "@/lib/db"
import { getCurrentUser } from "@/lib/session"
import { formatCurrency, formatDate, calculateProposalTotals, formatNetPlusVat } from "@/lib/utils"

const STATUS_STYLES: Record<string, string> = {
  DRAFT: "bg-gray-100 text-gray-600",
  READY: "bg-blue-100 text-blue-700",
  SENT: "bg-amber-100 text-amber-700",
  SIGNED: "bg-purple-100 text-purple-700",
  DEPOSIT_PAID: "bg-emerald-100 text-emerald-800",
  WON: "bg-emerald-100 text-emerald-700",
  LOST: "bg-red-100 text-red-600",
}

// Statuses that count as a win for conversion.
const WON = new Set(["SIGNED", "DEPOSIT_PAID", "WON"])

type Row = {
  key: string
  name: string
  company: string | null
  email: string | null
  proposals: {
    id: string
    title: string
    status: string
    totals: { subtotal: number; vat: number; total: number }
    updatedAt: Date
  }[]
  total: number
  sent: number
  won: number
}

export default async function CustomersPage() {
  const user = await getCurrentUser()
  if (!user) redirect("/auth/login")

  const proposals = await db.proposal.findMany({
    where: { organizationId: user.organizationId },
    orderBy: { updatedAt: "desc" },
    include: {
      pricingLineItems: true,
      survey: { select: { title: true, clientCompany: true } },
    },
  })

  // Group by email (stable) falling back to name.
  const map = new Map<string, Row>()
  for (const p of proposals) {
    const email = p.clientEmail?.trim().toLowerCase() || ""
    const key = email || `name:${p.clientName.trim().toLowerCase()}`
    let row = map.get(key)
    if (!row) {
      row = {
        key,
        name: p.clientName,
        company: p.survey.clientCompany,
        email: p.clientEmail || null,
        proposals: [],
        total: 0,
        sent: 0,
        won: 0,
      }
      map.set(key, row)
    }
    const totals = calculateProposalTotals(p.pricingLineItems)
    row.proposals.push({
      id: p.id,
      title: p.survey.title,
      status: p.status,
      totals,
      updatedAt: p.updatedAt,
    })
    row.total += totals.total
    if (p.sentAt) row.sent += 1
    if (WON.has(p.status)) row.won += 1
  }

  // Most proposals first.
  const rows = [...map.values()].sort((a, b) => b.proposals.length - a.proposals.length)

  return (
    <div className="space-y-6 overflow-x-hidden">
      <div className="flex items-center gap-2">
        <Users className="w-6 h-6 text-brand-navy" />
        <h1 className="text-2xl font-bold text-brand-navy">Customers</h1>
        <span className="text-sm text-gray-400">({rows.length})</span>
      </div>

      {rows.length === 0 ? (
        <div className="bg-white rounded-xl shadow-sm p-10 text-center text-gray-400">
          Customers appear here once you&apos;ve created proposals.
        </div>
      ) : (
        <div className="space-y-4">
          {rows.map((r) => {
            const conversion = r.sent > 0 ? Math.round((r.won / r.sent) * 100) : null
            return (
              <section key={r.key} className="bg-white rounded-xl shadow-sm p-5">
                <div className="flex flex-wrap items-start justify-between gap-3 mb-3">
                  <div className="min-w-0">
                    <div className="font-semibold text-brand-navy truncate">
                      {r.name}
                      {r.company ? <span className="text-gray-400 font-normal"> · {r.company}</span> : ""}
                    </div>
                    {r.email && <div className="text-sm text-gray-500 truncate">{r.email}</div>}
                  </div>
                  <div className="flex items-center gap-4 text-right shrink-0">
                    <div>
                      <div className="text-xs text-gray-400">Proposals</div>
                      <div className="font-bold text-brand-navy">{r.proposals.length}</div>
                    </div>
                    <div>
                      <div className="text-xs text-gray-400">Conversion</div>
                      <div className="font-bold text-emerald-600">
                        {conversion === null ? "—" : `${conversion}%`}
                      </div>
                    </div>
                    <div>
                      <div className="text-xs text-gray-400">Quoted (inc VAT)</div>
                      <div className="font-bold text-brand-navy">{formatCurrency(r.total)}</div>
                    </div>
                  </div>
                </div>
                <ul className="divide-y border-t">
                  {r.proposals.map((p) => (
                    <li key={p.id}>
                      <Link href={`/proposals/${p.id}`}
                        className="flex items-center justify-between gap-3 py-2.5 hover:bg-gray-50 -mx-2 px-2 rounded">
                        <span className="text-sm text-gray-700 truncate min-w-0">
                          {p.title}
                          <span className="text-gray-400"> · {formatNetPlusVat(p.totals)} · {formatDate(p.updatedAt)}</span>
                        </span>
                        <span className={`shrink-0 whitespace-nowrap text-xs font-semibold px-2 py-0.5 rounded-full ${STATUS_STYLES[p.status]}`}>
                          {p.status}
                        </span>
                      </Link>
                    </li>
                  ))}
                </ul>
              </section>
            )
          })}
        </div>
      )}
      <p className="text-xs text-gray-400">
        Conversion = accepted proposals (signed, deposit paid or won) as a share of those sent.
      </p>
    </div>
  )
}
