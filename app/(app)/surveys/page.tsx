import Link from "next/link"
import { redirect } from "next/navigation"
import { Plus } from "lucide-react"
import { db } from "@/lib/db"
import { getCurrentUser } from "@/lib/session"
import { formatDate } from "@/lib/utils"
import { ItemActions } from "@/components/item-actions"
import { ListSearch } from "@/components/list-search"

export default async function SurveysPage({
  searchParams,
}: {
  searchParams: { folder?: string; scope?: string; q?: string }
}) {
  const user = await getCurrentUser()
  if (!user) redirect("/auth/login")

  const folderId = searchParams.folder
  const q = searchParams.q?.trim()
  const canViewAll = user.role === "OWNER" || user.organization.membersViewAll
  const viewingAll = searchParams.scope === "all" && canViewAll
  const buildLink = (folder?: string, all?: boolean) => {
    const p = new URLSearchParams()
    if (all) p.set("scope", "all")
    if (folder) p.set("folder", folder)
    const s = p.toString()
    return `/surveys${s ? `?${s}` : ""}`
  }

  const [folders, surveys] = await Promise.all([
    db.folder.findMany({
      where: { organizationId: user.organizationId },
      orderBy: { name: "asc" },
    }),
    db.siteSurvey.findMany({
      where: {
        organizationId: user.organizationId,
        ...(folderId ? { folderId } : {}),
        ...(viewingAll ? {} : { createdById: user.id }),
        ...(q
          ? {
              OR: [
                { title: { contains: q, mode: "insensitive" as const } },
                { clientName: { contains: q, mode: "insensitive" as const } },
                { clientCompany: { contains: q, mode: "insensitive" as const } },
                { clientAddress: { contains: q, mode: "insensitive" as const } },
              ],
            }
          : {}),
      },
      orderBy: { updatedAt: "desc" },
      include: {
        proposal: { select: { id: true, status: true } },
        _count: { select: { photos: true, voiceNotes: true } },
        createdBy: { select: { name: true, email: true } },
      },
    }),
  ])

  return (
    <div className="space-y-6 overflow-x-hidden">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-2xl font-bold text-brand-navy">Site surveys</h1>
        <Link href="/surveys/new"
          className="shrink-0 inline-flex items-center gap-2 px-4 py-2.5 bg-brand-blue text-white rounded-lg font-semibold hover:bg-blue-700 transition">
          <Plus className="w-5 h-5" /> New survey
        </Link>
      </div>

      <ListSearch placeholder="Search by job, client, company or address…" />

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

      {surveys.length === 0 ? (
        <div className="bg-white rounded-xl shadow-sm p-10 text-center text-gray-400">
          {q ? <>No surveys match &ldquo;{q}&rdquo;.</> : "No surveys yet. Create your first one to get started."}
        </div>
      ) : (
        <div className="bg-white rounded-xl shadow-sm divide-y">
          {surveys.map((s) => (
            <div key={s.id} className="flex items-center gap-1 pr-2 hover:bg-gray-50 transition">
              <Link href={`/surveys/${s.id}`}
                className="flex items-center justify-between gap-3 p-4 flex-1 min-w-0">
                <div className="min-w-0">
                  <div className="font-medium text-gray-900 truncate">{s.title}</div>
                  <div className="text-sm text-gray-500 truncate">
                    {s.clientName} · {s.serviceType} · {formatDate(s.updatedAt)}
                    {viewingAll && s.createdBy && ` · by ${s.createdBy.name || s.createdBy.email}`}
                  </div>
                  <div className="text-xs text-gray-400 mt-0.5">
                    {s._count.photos} photos · {s._count.voiceNotes} voice notes
                  </div>
                </div>
                {s.proposal ? (
                  <span className="shrink-0 whitespace-nowrap text-xs font-semibold px-2.5 py-1 rounded-full bg-blue-100 text-blue-700">
                    {s.proposal.status}
                  </span>
                ) : (
                  <span className="shrink-0 whitespace-nowrap text-xs font-semibold px-2.5 py-1 rounded-full bg-gray-100 text-gray-500">
                    No proposal
                  </span>
                )}
              </Link>
              <ItemActions kind="survey" id={s.id} title={s.title} />
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
