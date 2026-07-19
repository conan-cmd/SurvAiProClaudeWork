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
  SIGNED: "bg-purple-100 text-purple-700",
  DEPOSIT_PAID: "bg-emerald-100 text-emerald-800",
  WON: "bg-emerald-100 text-emerald-700",
  LOST: "bg-red-100 text-red-600",
}

function rangeFromParams(searchParams: { period?: string; from?: string; to?: string }) {
  const now = new Date()
  if (searchParams.from || searchParams.to) {
    return {
      label: "Custom range",
      from: searchParams.from ? new Date(searchParams.from) : new Date(0),
      to: searchParams.to ? new Date(searchParams.to + "T23:59:59") : now,
    }
  }
  if (searchParams.period === "7d")
    return { label: "Last 7 days", from: new Date(now.getTime() - 7 * 864e5), to: now }
  if (searchParams.period === "30d")
    return { label: "Last 30 days", from: new Date(now.getTime() - 30 * 864e5), to: now }
  return { label: "All time", from: new Date(0), to: now }
}

export default async function DashboardPage({
  searchParams,
}: {
  searchParams: { period?: string; from?: string; to?: string }
}) {
  const user = await getCurrentUser()
  if (!user) redirect("/auth/login")

  const range = rangeFromParams(searchParams)

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

  // Stats respect the selected time period (by proposal creation date)
  const inRange = proposals.filter(
    (p) => p.createdAt >= range.from && p.createdAt <= range.to
  )
  const byStatus = (s: string) => inRange.filter((p) => p.status === s)
  const sentCount = inRange.filter((p) => p.sentAt && p.sentAt >= range.from && p.sentAt <= range.to).length
  const totalQuoted = inRange.reduce(
    (sum, p) => sum + calculateProposalTotals(p.pricingLineItems).total,
    0
  )
  const avgValue = inRange.length ? totalQuoted / inRange.length : 0

  // Average AI generation time - the number that proves the tagline
  const genTimes = proposals
    .map((p) => p.generationMs)
    .filter((ms): ms is number => typeof ms === "number" && ms > 0)
  const avgGenSeconds = genTimes.length
    ? Math.round(genTimes.reduce((a, b) => a + b, 0) / genTimes.length / 1000)
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

      {/* Time period filter */}
      <div className="flex flex-wrap items-center gap-2 text-sm">
        {[["All time", "/dashboard"], ["Last 7 days", "/dashboard?period=7d"], ["Last 30 days", "/dashboard?period=30d"]].map(
          ([label, href]) => (
            <Link key={href} href={href}
              className={`px-3 py-1.5 rounded-full font-medium border transition ${
                range.label === label
                  ? "bg-brand-navy text-white border-brand-navy"
                  : "bg-white text-gray-600 hover:border-gray-400"
              }`}>
              {label}
            </Link>
          )
        )}
        <form className="flex items-center gap-1.5" action="/dashboard" method="get">
          <input type="date" name="from" defaultValue={searchParams.from}
            className="px-2 py-1 border rounded-lg bg-white text-xs" />
          <span className="text-gray-400">to</span>
          <input type="date" name="to" defaultValue={searchParams.to}
            className="px-2 py-1 border rounded-lg bg-white text-xs" />
          <button type="submit" className="px-3 py-1.5 rounded-full border font-medium bg-white text-gray-600 hover:border-gray-400">
            Go
          </button>
        </form>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
        <div className="bg-white rounded-xl p-4 shadow-sm">
          <div className="flex items-center gap-2 text-gray-500 text-sm mb-1">
            <TrendingUp className="w-4 h-4" /> Total quoted
          </div>
          <div className="text-xl font-bold text-brand-navy">{formatCurrency(totalQuoted)}</div>
        </div>
        <div className="bg-white rounded-xl p-4 shadow-sm">
          <div className="flex items-center gap-2 text-gray-500 text-sm mb-1">
            <FileText className="w-4 h-4" /> Proposals
          </div>
          <div className="text-xl font-bold text-brand-navy">{inRange.length}</div>
          <div className="text-xs text-gray-400">avg {formatCurrency(avgValue)}</div>
        </div>
        <div className="bg-white rounded-xl p-4 shadow-sm">
          <div className="flex items-center gap-2 text-gray-500 text-sm mb-1">
            <Clock className="w-4 h-4" /> Draft generated in
          </div>
          <div className="text-xl font-bold text-brand-navy">
            {avgGenSeconds === null ? "—" : `${avgGenSeconds}s avg`}
          </div>
        </div>
        <div className="bg-white rounded-xl p-4 shadow-sm">
          <div className="flex items-center gap-2 text-gray-500 text-sm mb-1">
            <FileText className="w-4 h-4" /> Sent
          </div>
          <div className="text-xl font-bold text-brand-navy">{sentCount}</div>
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
