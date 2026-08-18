import Link from "next/link"
import { redirect } from "next/navigation"
import { Eye, ShieldAlert, Clock, AlertTriangle, ShieldCheck, BellRing } from "lucide-react"
import { db } from "@/lib/db"
import { getCurrentUser } from "@/lib/session"
import { isApprover } from "@/lib/permissions"
import { formatDate, calculateProposalTotals, formatNetPlusVat } from "@/lib/utils"
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

export default async function ProposalsPage({
  searchParams,
}: {
  searchParams: { folder?: string; scope?: string; status?: string; q?: string }
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
  const buildLink = (folder?: string, all?: boolean, status?: string) => {
    const p = new URLSearchParams()
    if (all) p.set("scope", "all")
    if (folder) p.set("folder", folder)
    if (status) p.set("status", status)
    if (searchParams.q) p.set("q", searchParams.q)
    const s = p.toString()
    return `/proposals${s ? `?${s}` : ""}`
  }
  const currentStatus = wonFilter ? "won" : statusFilter

  const [folders, proposals] = await Promise.all([
    db.folder.findMany({
      where: { organizationId: user.organizationId },
      orderBy: { name: "asc" },
    }),
    db.proposal.findMany({
      where: {
        organizationId: user.organizationId,
        ...(folderId ? { survey: { folderId } } : {}),
        ...(viewingAll ? {} : { createdById: user.id }),
        ...statusWhere,
        ...(q
          ? {
              OR: [
                { clientName: { contains: q, mode: "insensitive" as const } },
                { clientEmail: { contains: q, mode: "insensitive" as const } },
                { survey: { title: { contains: q, mode: "insensitive" as const } } },
                { survey: { clientAddress: { contains: q, mode: "insensitive" as const } } },
                { survey: { clientCompany: { contains: q, mode: "insensitive" as const } } },
              ],
            }
          : {}),
      },
      orderBy: [{ sortIndex: { sort: "asc", nulls: "first" } }, { updatedAt: "desc" }],
      include: {
        pricingLineItems: true,
        survey: { select: { title: true } },
        createdBy: { select: { name: true, email: true } },
        _count: { select: { views: true } },
        views: { select: { updatedAt: true }, orderBy: { updatedAt: "desc" }, take: 1 },
      },
    }),
  ])

  return (
    <div className="space-y-6 overflow-x-hidden">
      <h1 className="text-2xl font-bold text-brand-navy">Proposals</h1>

      <ListSearch placeholder="Search by job, client, company, email or address…" />

      {canViewAll && (
        <div className="flex flex-wrap items-center gap-2 text-sm">
          <Link href={buildLink(folderId, false)}
            className={`px-3 py-1.5 rounded-full font-medium border transition ${!viewingAll ? "bg-brand-blue text-white border-brand-blue" : "bg-white text-gray-600 hover:border-gray-400"}`}>
            Mine
          </Link>
          <Link href={buildLink(folderId, true)}
            className={`px-3 py-1.5 rounded-full font-medium border transition ${viewingAll ? "bg-brand-blue text-white border-brand-blue" : "bg-white text-gray-600 hover:border-gray-400"}`}>
            Everyone
          </Link>
        </div>
      )}

      {folders.length > 0 && (
        <div className="flex flex-wrap items-center gap-2 text-sm">
          <Link href={buildLink(undefined, viewingAll)}
            className={`px-3 py-1.5 rounded-full font-medium border transition ${!folderId ? "bg-brand-navy text-white border-brand-navy" : "bg-white text-gray-600 hover:border-gray-400"}`}>
            All
          </Link>
          {folders.map((f) => (
            <Link key={f.id} href={buildLink(f.id, viewingAll)}
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
          <Link key={value || "all"} href={buildLink(folderId, viewingAll, value || undefined)}
            className={`px-3 py-1.5 rounded-full font-medium border transition ${
              (currentStatus || "") === value
                ? "bg-brand-blue text-white border-brand-blue"
                : "bg-white text-gray-600 hover:border-gray-400"
            }`}>
            {label}
          </Link>
        ))}
      </div>
      {wonFilter && (
        <div className="text-sm">
          <span className="inline-flex items-center gap-2 bg-blue-50 border border-blue-200 rounded-full px-3 py-1 text-brand-blue font-medium">
            Showing won deals (signed, deposit paid &amp; won)
            <Link href={buildLink(folderId, viewingAll)} className="text-gray-400 hover:text-gray-600" aria-label="Clear filter">✕</Link>
          </span>
        </div>
      )}

      {proposals.length === 0 ? (
        <div className="bg-white rounded-xl shadow-sm p-10 text-center text-gray-400">
          {q ? <>No proposals match &ldquo;{q}&rdquo;.</> : "Generate a proposal from one of your surveys and it will appear here."}
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
                </div>
                {/* Chips wrap onto their own line on mobile so the title keeps full width */}
                <div className="flex flex-wrap items-center gap-1.5 sm:shrink-0 sm:justify-end [&>span]:text-[11px] sm:[&>span]:text-xs">
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
                  <span className={`whitespace-nowrap text-xs font-semibold px-2.5 py-1 rounded-full ${STATUS_STYLES[p.status]}`}>
                    {p.status}
                  </span>
                </div>
              </Link>
              <ItemActions kind="proposal" id={p.id} surveyId={p.surveyId} title={p.survey.title} proposalStatus={p.status} />
            </DraggableRow>
          ))}
        </div>
      )}
    </div>
  )
}
