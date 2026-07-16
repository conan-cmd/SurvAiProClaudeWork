import Link from "next/link"
import { redirect } from "next/navigation"
import { Plus, TrendingUp, Clock, FileText, ClipboardList } from "lucide-react"
import { db } from "@/lib/db"
import { getCurrentUser } from "@/lib/session"
import { formatCurrency, formatDate, calculateProposalTotals } from "@/lib/utils"

const STATUS_STYLES: Record<string, string> = {
  DRAFT: "bg-gray-100 text-gray-600",
  READY: "bg-blue-100 text-blue-700",
  SENT: "bg-amber-100 text-amber-700",
  WON: "bg-emerald-100 text-emerald-700",
  LOST: "bg-red-100 text-red-600",
}

export default async function DashboardPage() {
  const user = await getCurrentUser()
  if (!user) redirect("/auth/login")

  const [surveys, proposals] = await Promise.all([
    db.siteSurvey.findMany({
      where: { organizationId: user.organizationId },
      orderBy: { updatedAt: "desc" },
      take: 5,
      include: { proposal: { select: { id: true, status: true } } },
    }),
    db.proposal.findMany({
      where: { organizationId: user.organizationId },
      orderBy: { updatedAt: "desc" },
      include: {
        pricingLineItems: true,
        survey: { select: { createdAt: true } },
      },
    }),
  ])

  const byStatus = (s: string) => proposals.filter((p) => p.status === s)
  const totalQuoted = proposals.reduce(
    (sum, p) => sum + calculateProposalTotals(p.pricingLineItems).total,
    0
  )

  // Average time from survey creation to proposal creation
  const creationTimes = proposals
    .map((p) => p.createdAt.getTime() - p.survey.createdAt.getTime())
    .filter((ms) => ms > 0)
  const avgMinutes = creationTimes.length
    ? Math.round(creationTimes.reduce((a, b) => a + b, 0) / creationTimes.length / 60000)
    : null

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-brand-navy">Dashboard</h1>
          <p className="text-gray-500 text-sm">Welcome back{user.name ? `, ${user.name}` : ""}</p>
        </div>
        <Link
          href="/surveys/new"
          className="inline-flex items-center gap-2 px-4 py-2.5 bg-brand-blue text-white rounded-lg font-semibold hover:bg-blue-700 transition shadow-sm"
        >
          <Plus className="w-5 h-5" /> New Site Survey
        </Link>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <div className="bg-white rounded-xl p-4 shadow-sm">
          <div className="flex items-center gap-2 text-gray-500 text-sm mb-1">
            <TrendingUp className="w-4 h-4" /> Total quoted
          </div>
          <div className="text-xl font-bold text-brand-navy">{formatCurrency(totalQuoted)}</div>
        </div>
        <div className="bg-white rounded-xl p-4 shadow-sm">
          <div className="flex items-center gap-2 text-gray-500 text-sm mb-1">
            <Clock className="w-4 h-4" /> Avg. creation time
          </div>
          <div className="text-xl font-bold text-brand-navy">
            {avgMinutes === null ? "—" : avgMinutes < 60 ? `${avgMinutes} min` : `${(avgMinutes / 60).toFixed(1)} hrs`}
          </div>
        </div>
        <div className="bg-white rounded-xl p-4 shadow-sm">
          <div className="flex items-center gap-2 text-gray-500 text-sm mb-1">
            <FileText className="w-4 h-4" /> Sent
          </div>
          <div className="text-xl font-bold text-brand-navy">{byStatus("SENT").length}</div>
        </div>
        <div className="bg-white rounded-xl p-4 shadow-sm">
          <div className="flex items-center gap-2 text-gray-500 text-sm mb-1">
            <TrendingUp className="w-4 h-4 text-brand-green" /> Won / Lost
          </div>
          <div className="text-xl font-bold text-brand-navy">
            <span className="text-emerald-600">{byStatus("WON").length}</span>
            {" / "}
            <span className="text-red-500">{byStatus("LOST").length}</span>
          </div>
        </div>
      </div>

      <div className="grid md:grid-cols-2 gap-6">
        {/* Recent surveys */}
        <section className="bg-white rounded-xl shadow-sm p-5">
          <div className="flex items-center justify-between mb-4">
            <h2 className="font-semibold text-brand-navy flex items-center gap-2">
              <ClipboardList className="w-4 h-4" /> Recent surveys
            </h2>
            <Link href="/surveys" className="text-sm text-brand-blue hover:underline">
              View all
            </Link>
          </div>
          {surveys.length === 0 ? (
            <p className="text-sm text-gray-400 py-6 text-center">
              No surveys yet. Create your first one!
            </p>
          ) : (
            <ul className="divide-y">
              {surveys.map((s) => (
                <li key={s.id}>
                  <Link
                    href={`/surveys/${s.id}`}
                    className="flex items-center justify-between py-3 hover:bg-gray-50 -mx-2 px-2 rounded"
                  >
                    <div className="min-w-0">
                      <div className="font-medium text-gray-900 truncate">{s.title}</div>
                      <div className="text-sm text-gray-500 truncate">
                        {s.clientName} · {formatDate(s.createdAt)}
                      </div>
                    </div>
                    {s.proposal && (
                      <span
                        className={`text-xs font-semibold px-2 py-1 rounded-full ${STATUS_STYLES[s.proposal.status]}`}
                      >
                        {s.proposal.status}
                      </span>
                    )}
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </section>

        {/* Recent proposals */}
        <section className="bg-white rounded-xl shadow-sm p-5">
          <div className="flex items-center justify-between mb-4">
            <h2 className="font-semibold text-brand-navy flex items-center gap-2">
              <FileText className="w-4 h-4" /> Recent proposals
            </h2>
            <Link href="/proposals" className="text-sm text-brand-blue hover:underline">
              View all
            </Link>
          </div>
          {proposals.length === 0 ? (
            <p className="text-sm text-gray-400 py-6 text-center">
              Proposals you generate will appear here.
            </p>
          ) : (
            <ul className="divide-y">
              {proposals.slice(0, 5).map((p) => (
                <li key={p.id}>
                  <Link
                    href={`/proposals/${p.id}`}
                    className="flex items-center justify-between py-3 hover:bg-gray-50 -mx-2 px-2 rounded"
                  >
                    <div className="min-w-0">
                      <div className="font-medium text-gray-900 truncate">{p.clientName}</div>
                      <div className="text-sm text-gray-500">
                        {formatCurrency(calculateProposalTotals(p.pricingLineItems).total)} · {formatDate(p.updatedAt)}
                      </div>
                    </div>
                    <span
                      className={`text-xs font-semibold px-2 py-1 rounded-full ${STATUS_STYLES[p.status]}`}
                    >
                      {p.status}
                    </span>
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>
    </div>
  )
}
