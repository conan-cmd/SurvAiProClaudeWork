import Link from "next/link"
import { redirect } from "next/navigation"
import { Plus } from "lucide-react"
import { db } from "@/lib/db"
import { getCurrentUser } from "@/lib/session"
import { formatDate } from "@/lib/utils"
import { ItemActions } from "@/components/item-actions"

export default async function SurveysPage() {
  const user = await getCurrentUser()
  if (!user) redirect("/auth/login")

  const surveys = await db.siteSurvey.findMany({
    where: { organizationId: user.organizationId },
    orderBy: { updatedAt: "desc" },
    include: {
      proposal: { select: { id: true, status: true } },
      _count: { select: { photos: true, voiceNotes: true } },
    },
  })

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold text-brand-navy">Site surveys</h1>
        <Link href="/surveys/new"
          className="inline-flex items-center gap-2 px-4 py-2.5 bg-brand-blue text-white rounded-lg font-semibold hover:bg-blue-700 transition">
          <Plus className="w-5 h-5" /> New survey
        </Link>
      </div>

      {surveys.length === 0 ? (
        <div className="bg-white rounded-xl shadow-sm p-10 text-center text-gray-400">
          No surveys yet. Create your first one to get started.
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
