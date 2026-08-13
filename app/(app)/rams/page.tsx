import Link from "next/link"
import { redirect } from "next/navigation"
import { ShieldAlert, Check } from "lucide-react"
import { getCurrentUser } from "@/lib/session"
import { db } from "@/lib/db"
import { ListSearch } from "@/components/list-search"
import { NewRamsButton } from "@/components/new-rams-modal"

export const dynamic = "force-dynamic"

function signedCount(sections: string | null): { signed: number; total: number } {
  try {
    const s = sections ? JSON.parse(sections) : {}
    const ops = Array.isArray(s.operatives) ? s.operatives : []
    return { signed: ops.filter((o: { signedAt?: string }) => o.signedAt).length, total: ops.length }
  } catch {
    return { signed: 0, total: 0 }
  }
}

export default async function RamsListPage({
  searchParams,
}: {
  searchParams: { q?: string }
}) {
  const user = await getCurrentUser()
  if (!user) redirect("/auth/login")

  const q = searchParams.q?.trim()
  const rams = await db.rams.findMany({
    where: {
      organizationId: user.organizationId,
      ...(q
        ? {
            survey: {
              OR: [
                { title: { contains: q, mode: "insensitive" as const } },
                { clientName: { contains: q, mode: "insensitive" as const } },
                { clientAddress: { contains: q, mode: "insensitive" as const } },
              ],
            },
          }
        : {}),
    },
    orderBy: { updatedAt: "desc" },
    include: { survey: { select: { title: true, clientName: true } } },
  })

  return (
    <div className="max-w-3xl mx-auto space-y-5">
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <ShieldAlert className="w-6 h-6 text-amber-600" />
          <h1 className="text-xl font-bold text-brand-navy">RAMS</h1>
        </div>
        <NewRamsButton />
      </div>

      <ListSearch placeholder="Search by job, client or address…" />

      {rams.length === 0 ? (
        <div className="bg-white rounded-xl shadow-sm p-8 text-center text-gray-500">
          {q ? (
            <p>No RAMS match &ldquo;{q}&rdquo;.</p>
          ) : (
            <>
              <p>No RAMS yet.</p>
              <p className="text-sm mt-1">
                Tap <strong>New RAMS</strong> to draft one from scratch — or open a survey or proposal
                and tap <strong>Create RAMS</strong> there.
              </p>
            </>
          )}
        </div>
      ) : (
        <div className="space-y-2">
          {rams.map((r) => {
            const { signed, total } = signedCount(r.sections)
            return (
              <Link key={r.id} href={`/rams/${r.id}`}
                className="flex items-center justify-between gap-3 bg-white rounded-xl shadow-sm p-4 hover:shadow transition">
                <div className="min-w-0">
                  <div className="font-semibold text-brand-navy truncate">{r.survey.title}</div>
                  <div className="text-sm text-gray-500 truncate">{r.survey.clientName}</div>
                </div>
                <div className="shrink-0 text-right">
                  {total > 0 ? (
                    <span className={`inline-flex items-center gap-1 text-xs font-medium ${signed === total ? "text-emerald-600" : "text-gray-500"}`}>
                      <Check className="w-3.5 h-3.5" /> {signed}/{total} signed
                    </span>
                  ) : (
                    <span className="text-xs text-gray-400">No operatives yet</span>
                  )}
                  <div className="text-[11px] text-gray-400 mt-0.5">
                    {new Date(r.updatedAt).toLocaleDateString("en-GB")}
                  </div>
                </div>
              </Link>
            )
          })}
        </div>
      )}
    </div>
  )
}
