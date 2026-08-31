import Link from "next/link"
import { redirect } from "next/navigation"
import { Eye, EyeOff, ShieldAlert, Clock, AlertTriangle, ShieldCheck, BellRing, KanbanSquare, MapPin } from "lucide-react"
import { db } from "@/lib/db"
import { getCurrentUser } from "@/lib/session"
import { isApprover } from "@/lib/permissions"
import { formatDate, formatCurrency, calculateProposalTotals, formatNetPlusVat } from "@/lib/utils"
import { ItemActions } from "@/components/item-actions"
import { ListSearch } from "@/components/list-search"
import { DraggableRow } from "@/components/draggable-row"
import { parseNudgeHistory } from "@/lib/nudge"
import { ProposalStatus } from "@prisma/client"

function relTime(d: Date | string): string {
  const mins = Math.round((Date.now() - new Date(d).getTime()) / 60000)
  if (mins < 1) return "just now"
  if (mins < 60) return `${mins}m ago`
  const hrs = Math.round(mins / 60)
  if (hrs < 24) return `${hrs}h ago`
  return `${Math.round(hrs / 24)}d ago`
}

const STATUS_STYLES: Record<string, string> = {
  DRAFT: "bg-gray-100 text-gray-600",
  READY: "bg-blue-100 text-blue-700",
  SENT: "bg-amber-100 text-amber-700",
  SIGNED: "bg-purple-100 text-purple-700",
  DEPOSIT_PAID: "bg-emerald-100 text-emerald-800",
  WON: "bg-emerald-100 text-emerald-700",
  LOST: "bg-red-100 text-red-600",
}

const PERIODS: [string, string][] = [
  ["", "All time"],
  ["7d", "Last 7 days"],
  ["30d", "Last 30 days"],
  ["90d", "Last 90 days"],
  ["year", "This year"],
]

function periodStart(period?: string): Date | undefined {
  if (period === "7d") return new Date(Date.now() - 7 * 864e5)
  if (period === "30d") return new Date(Date.now() - 30 * 864e5)
  if (period === "90d") return new Date(Date.now() - 90 * 864e5)
  if (period === "year") return new Date(new Date().getFullYear(), 0, 1)
  return undefined
}

export default async function ProposalsPage({
  searchParams,
}: {
  searchParams: {
    folder?: string; scope?: string; status?: string; q?: string; member?: string
    period?: string; viewed?: string; visit?: string
  }
}) {
  const user = await getCurrentUser()
  if (!user) redirect("/auth/login")

  const folderId = searchParams.folder
  const q = searchParams.q?.trim()
  const approver = isApprover(user)
  const canViewAll = user.role === "OWNER" || user.organization.membersViewAll
  const viewingAll = searchParams.scope === "all" && canViewAll
  // "won" is a pseudo-filter meaning any accepted deal (signed → deposit → won).
  const wonFilter = searchParams.status === "won"
  const statusFilter =
    searchParams.status && searchParams.status in STATUS_STYLES
      ? (searchParams.status as ProposalStatus)
      : undefined
  const statusWhere = wonFilter
    ? { status: { in: ["SIGNED", "DEPOSIT_PAID", "WON"] as ProposalStatus[] } }
    : statusFilter
      ? { status: statusFilter }
      : {}
  // Per-member filter — only meaningful when viewing everyone's proposals.
  const memberId = viewingAll ? searchParams.member : undefined
  const period = PERIODS.some(([v]) => v === searchParams.period) ? searchParams.period : undefined
  const from = periodStart(period)
  const notViewed = searchParams.viewed === "no"
  const visit = searchParams.visit === "yes" ? true : searchParams.visit === "no" ? false : undefined
  const currentStatus = wonFilter ? "won" : statusFilter

  // Every filter chip keeps the rest of the current filters — override only its own key.
  const link = (overrides: Record<string, string | undefined>) => {
    const merged: Record<string, string | undefined> = {
      scope: viewingAll ? "all" : undefined,
      member: memberId,
      folder: folderId,
      status: currentStatus || undefined,
      period,
      viewed: notViewed ? "no" : undefined,
      visit: searchParams.visit,
      q: searchParams.q,
      ...overrides,
    }
    const p = new URLSearchParams()
    for (const [k, v] of Object.entries(merged)) if (v) p.set(k, v)
    const s = p.toString()
    return `/proposals${s ? `?${s}` : ""}`
  }

  // The survey relation gets filtered on folder AND site-visit tag — build once.
  const surveyWhere = {
    ...(folderId ? { folderId } : {}),
    ...(visit === undefined ? {} : { surveyedInPerson: visit }),
  }
  // On the won view the time filter means "won in this period" (falling back to
  // the signature date for deals won before wonAt existed); otherwise it's the
  // proposal's creation date. Kept in AND so it can't clash with the search OR.
  const andWhere: object[] = []
  if (from) {
    andWhere.push(
      wonFilter
        ? { OR: [{ wonAt: { gte: from } }, { wonAt: null, signedAt: { gte: from } }] }
        : { createdAt: { gte: from } }
    )
  }
  if (q) {
    andWhere.push({
      OR: [
        { clientName: { contains: q, mode: "insensitive" as const } },
        { clientEmail: { contains: q, mode: "insensitive" as const } },
        { survey: { title: { contains: q, mode: "insensitive" as const } } },
        { survey: { clientAddress: { contains: q, mode: "insensitive" as const } } },
        { survey: { clientCompany: { contains: q, mode: "insensitive" as const } } },
      ],
    })
  }

  const [folders, teamMembers, proposals] = await Promise.all([
    db.folder.findMany({
      where: { organizationId: user.organizationId },
      orderBy: { name: "asc" },
    }),
    canViewAll
      ? db.user.findMany({
          where: { organizationId: user.organizationId },
          select: { id: true, name: true, email: true },
          orderBy: { createdAt: "asc" },
        })
      : Promise.resolve([]),
    db.proposal.findMany({
      where: {
        organizationId: user.organizationId,
        ...(Object.keys(surveyWhere).length ? { survey: surveyWhere } : {}),
        ...(viewingAll ? (memberId ? { createdById: memberId } : {}) : { createdById: user.id }),
        ...statusWhere,
        ...(notViewed ? { views: { none: {} } } : {}),
        ...(andWhere.length ? { AND: andWhere } : {}),
      },
      orderBy: [{ sortIndex: { sort: "asc", nulls: "first" } }, { updatedAt: "desc" }],
      include: {
        pricingLineItems: true,
        survey: { select: { title: true, clientAddress: true, surveyedInPerson: true } },
        createdBy: { select: { name: true, email: true } },
        _count: { select: { views: true } },
        views: { select: { updatedAt: true }, orderBy: { updatedAt: "desc" }, take: 1 },
      },
    }),
  ])

  const totalNet = proposals.reduce(
    (sum, p) => sum + calculateProposalTotals(p.pricingLineItems).subtotal,
    0
  )

  return (
    <div className="space-y-6 overflow-x-hidden">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-2xl font-bold text-brand-navy">Proposals</h1>
        <Link href="/proposals/pipeline"
          className="inline-flex items-center gap-1.5 px-3 py-2 border rounded-lg text-sm font-medium bg-white hover:bg-gray-50">
          <KanbanSquare className="w-4 h-4" /> Pipeline
        </Link>
      </div>

      <ListSearch placeholder="Search by job, client, company, email or address…" />

      {canViewAll && (
        <div className="flex flex-wrap items-center gap-2 text-sm">
          <Link href={link({ scope: undefined, member: undefined })}
            className={`px-3 py-1.5 rounded-full font-medium border transition ${!viewingAll ? "bg-brand-blue text-white border-brand-blue" : "bg-white text-gray-600 hover:border-gray-400"}`}>
            Mine
          </Link>
          <Link href={link({ scope: "all", member: undefined })}
            className={`px-3 py-1.5 rounded-full font-medium border transition ${viewingAll && !memberId ? "bg-brand-blue text-white border-brand-blue" : "bg-white text-gray-600 hover:border-gray-400"}`}>
            Everyone
          </Link>
          {/* One chip per team member — each person's proposals at a glance. */}
          {teamMembers.length > 1 && teamMembers.map((m) => (
            <Link key={m.id} href={link({ scope: "all", member: m.id })}
              className={`px-3 py-1.5 rounded-full font-medium border transition ${memberId === m.id ? "bg-brand-blue text-white border-brand-blue" : "bg-white text-gray-600 hover:border-gray-400"}`}>
              {(m.name || m.email).split(" ")[0]}
            </Link>
          ))}
        </div>
      )}

      {folders.length > 0 && (
        <div className="flex flex-wrap items-center gap-2 text-sm">
          <Link href={link({ folder: undefined })}
            className={`px-3 py-1.5 rounded-full font-medium border transition ${!folderId ? "bg-brand-navy text-white border-brand-navy" : "bg-white text-gray-600 hover:border-gray-400"}`}>
            All
          </Link>
          {folders.map((f) => (
            <Link key={f.id} href={link({ folder: f.id })}
              className={`px-3 py-1.5 rounded-full font-medium border transition ${folderId === f.id ? "bg-brand-navy text-white border-brand-navy" : "bg-white text-gray-600 hover:border-gray-400"}`}>
              {f.name}
            </Link>
          ))}
        </div>
      )}

      {/* Stage filter — see all drafts to send, or everything out with clients */}
      <div className="flex flex-wrap items-center gap-2 text-sm">
        {([
          ["", "All"],
          ["DRAFT", "Draft"],
          ["READY", "Ready"],
          ["SENT", "Sent"],
          ["SIGNED", "Signed"],
          ["DEPOSIT_PAID", "Deposit paid"],
          ["WON", "Won"],
          ["LOST", "Lost"],
        ] as const).map(([value, label]) => (
          <Link key={value || "all"} href={link({ status: value || undefined })}
            className={`px-3 py-1.5 rounded-full font-medium border transition ${
              (currentStatus || "") === value
                ? "bg-brand-blue text-white border-brand-blue"
                : "bg-white text-gray-600 hover:border-gray-400"
            }`}>
            {label}
          </Link>
        ))}
      </div>

      {/* Time period + engagement + site-visit filters */}
      <div className="flex flex-wrap items-center gap-2 text-sm">
        {PERIODS.map(([value, label]) => (
          <Link key={value || "all-time"} href={link({ period: value || undefined })}
            className={`px-3 py-1.5 rounded-full font-medium border transition ${
              (period || "") === value
                ? "bg-brand-navy text-white border-brand-navy"
                : "bg-white text-gray-600 hover:border-gray-400"
            }`}
            title={wonFilter && value ? "Filters won deals by the date they were won" : undefined}>
            {label}
          </Link>
        ))}
        <span className="w-px h-5 bg-gray-200 mx-1 hidden sm:block" />
        <Link href={link({ viewed: notViewed ? undefined : "no" })}
          className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full font-medium border transition ${
            notViewed ? "bg-brand-navy text-white border-brand-navy" : "bg-white text-gray-600 hover:border-gray-400"
          }`}
          title="Only proposals the client hasn't opened yet">
          <EyeOff className="w-3.5 h-3.5" /> Not viewed
        </Link>
        <Link href={link({ visit: visit === true ? undefined : "yes" })}
          className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full font-medium border transition ${
            visit === true ? "bg-brand-navy text-white border-brand-navy" : "bg-white text-gray-600 hover:border-gray-400"
          }`}
          title="Jobs tagged as surveyed in person">
          <MapPin className="w-3.5 h-3.5" /> Site visited
        </Link>
        <Link href={link({ visit: visit === false ? undefined : "no" })}
          className={`px-3 py-1.5 rounded-full font-medium border transition ${
            visit === false ? "bg-brand-navy text-white border-brand-navy" : "bg-white text-gray-600 hover:border-gray-400"
          }`}
          title="Jobs quoted without an in-person site visit">
          Quoted remotely
        </Link>
      </div>

      {/* Totals for whatever is filtered — the quick answer to "how many?" */}
      <div className="text-sm text-gray-600">
        <span className="font-semibold text-brand-navy">{proposals.length}</span>
        {" "}proposal{proposals.length === 1 ? "" : "s"}
        {proposals.length > 0 && <> · {formatCurrency(totalNet)} + VAT</>}
        {wonFilter && <> · won deals{from ? ` (${PERIODS.find(([v]) => v === period)?.[1].toLowerCase()}, by date won)` : ""}</>}
        {!wonFilter && from && <> · created {PERIODS.find(([v]) => v === period)?.[1].toLowerCase()}</>}
        {notViewed && <> · not yet opened by the client</>}
        {visit === true && <> · site visited</>}
        {visit === false && <> · quoted remotely</>}
      </div>

      {proposals.length === 0 ? (
        <div className="bg-white rounded-xl shadow-sm p-10 text-center text-gray-400">
          {q
            ? <>No proposals match &ldquo;{q}&rdquo;.</>
            : currentStatus || from || notViewed || visit !== undefined || folderId
              ? "No proposals match these filters."
              : "Generate a proposal from one of your surveys and it will appear here."}
        </div>
      ) : (
        <div className="bg-white rounded-xl shadow-sm divide-y">
          {proposals.map((p) => (
            <DraggableRow key={p.id} kind="proposal" id={p.id} className="flex items-center gap-1 pr-2 hover:bg-gray-50 transition">
              <Link href={`/proposals/${p.id}`}
                className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-1.5 sm:gap-3 p-4 pl-2 flex-1 min-w-0">
                <div className="min-w-0">
                  <div className="font-medium text-gray-900 truncate">{p.survey.title}</div>
                  <div className="text-sm text-gray-500 truncate">
                    {p.clientName} · {formatNetPlusVat(calculateProposalTotals(p.pricingLineItems))} · {formatDate(p.updatedAt)}
                    {viewingAll && p.createdBy && ` · by ${p.createdBy.name || p.createdBy.email}`}
                  </div>
                  {p.survey.clientAddress && (
                    <div className="text-xs text-gray-400 mt-0.5 truncate flex items-center gap-1">
                      <MapPin className="w-3 h-3 shrink-0" /> {p.survey.clientAddress}
                    </div>
                  )}
                </div>
                {/* Chips wrap onto their own line on mobile so the title keeps full width */}
                <div className="flex flex-wrap items-center gap-1.5 sm:shrink-0 sm:justify-end [&>span]:text-[11px] sm:[&>span]:text-xs">
                  {p.survey.surveyedInPerson && (
                    <span className="inline-flex items-center gap-1 whitespace-nowrap text-xs font-semibold px-2.5 py-1 rounded-full bg-sky-50 text-sky-700 border border-sky-200"
                      title="Surveyed in person — counts towards site-visit conversion">
                      <MapPin className="w-3.5 h-3.5" /> Site visit
                    </span>
                  )}
                  {/* Sign-off flag — only meaningful before a proposal is sent */}
                  {["DRAFT", "READY"].includes(p.status) && p.approvalStatus === "PENDING" && (
                    <span className={`inline-flex items-center gap-1 whitespace-nowrap text-xs font-semibold px-2.5 py-1 rounded-full ${approver ? "bg-amber-100 text-amber-800" : "bg-blue-100 text-blue-700"}`}
                      title={approver ? "Waiting for your sign-off — open to review" : "Submitted for review"}>
                      {approver ? <ShieldAlert className="w-3.5 h-3.5" /> : <Clock className="w-3.5 h-3.5" />}
                      {approver ? "Needs review" : "In review"}
                    </span>
                  )}
                  {["DRAFT", "READY"].includes(p.status) && p.approvalStatus === "CHANGES_REQUESTED" && (
                    <span className="inline-flex items-center gap-1 whitespace-nowrap text-xs font-semibold px-2.5 py-1 rounded-full bg-amber-100 text-amber-700"
                      title="An approver asked for changes">
                      <AlertTriangle className="w-3.5 h-3.5" /> Changes requested
                    </span>
                  )}
                  {["DRAFT", "READY"].includes(p.status) && p.approvalStatus === "APPROVED" && (
                    <span className="inline-flex items-center gap-1 whitespace-nowrap text-xs font-semibold px-2.5 py-1 rounded-full bg-emerald-100 text-emerald-700"
                      title="Signed off — ready to send">
                      <ShieldCheck className="w-3.5 h-3.5" /> Approved
                    </span>
                  )}
                  {p._count.views > 0 && (
                    <span className="inline-flex items-center gap-1 whitespace-nowrap text-xs font-semibold px-2.5 py-1 rounded-full bg-emerald-50 text-emerald-700"
                      title={`Opened by the client${p._count.views > 1 ? ` — ${p._count.views} times` : ""}`}>
                      <Eye className="w-3.5 h-3.5" /> Viewed{p.views[0] ? ` ${relTime(p.views[0].updatedAt)}` : ""}
                    </span>
                  )}
                  {(() => {
                    const nudges = parseNudgeHistory(p.nudgeHistory)
                    if (!nudges.length || ["SIGNED", "DEPOSIT_PAID", "WON"].includes(p.status)) return null
                    const last = nudges[nudges.length - 1]
                    return (
                      <span className="inline-flex items-center gap-1 whitespace-nowrap text-xs font-semibold px-2.5 py-1 rounded-full bg-amber-50 text-amber-700"
                        title={`Last nudge: ${last.templateName} — ${new Date(last.at).toLocaleDateString("en-GB")}`}>
                        <BellRing className="w-3.5 h-3.5" /> Nudged{nudges.length > 1 ? ` ×${nudges.length}` : ""}
                      </span>
                    )
                  })()}
                  {/* A signed / deposit-paid deal is a won deal — say so alongside the stage */}
                  {["SIGNED", "DEPOSIT_PAID"].includes(p.status) && (
                    <span className="whitespace-nowrap text-xs font-semibold px-2.5 py-1 rounded-full bg-emerald-100 text-emerald-700"
                      title={p.wonAt || p.signedAt
                        ? `Won ${new Date((p.wonAt || p.signedAt)!).toLocaleDateString("en-GB")}`
                        : "Won"}>
                      Won
                    </span>
                  )}
                  {/* Won-stage deals must show whether the paperwork is actually signed */}
                  {["SIGNED", "DEPOSIT_PAID", "WON"].includes(p.status) && (
                    <span className={`whitespace-nowrap text-xs font-semibold px-2.5 py-1 rounded-full border ${
                      p.signedAt ? "border-emerald-300 text-emerald-700 bg-white" : "border-amber-300 text-amber-700 bg-amber-50"
                    }`}
                      title={p.signedAt
                        ? `Signed${p.signedName ? ` by ${p.signedName}` : ""} ${new Date(p.signedAt).toLocaleString("en-GB", { day: "numeric", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" })} — open for the signature`
                        : "No signature on record"}>
                      {p.signedAt ? "Signed" : "Not signed"}
                    </span>
                  )}
                  <span className={`whitespace-nowrap text-xs font-semibold px-2.5 py-1 rounded-full ${STATUS_STYLES[p.status]}`}
                    title={p.status === "WON" && (p.wonAt || p.signedAt)
                      ? `Won ${new Date((p.wonAt || p.signedAt)!).toLocaleDateString("en-GB")}`
                      : undefined}>
                    {p.status}
                  </span>
                </div>
              </Link>
              <ItemActions kind="proposal" id={p.id} surveyId={p.surveyId} title={p.survey.title}
                proposalStatus={p.status} siteVisited={p.survey.surveyedInPerson} />
            </DraggableRow>
          ))}
        </div>
      )}
    </div>
  )
}
