import Link from "next/link"
import { redirect } from "next/navigation"
import { db } from "@/lib/db"
import { getCurrentUser } from "@/lib/session"
import { formatCurrency, formatDate, calculateProposalTotals } from "@/lib/utils"
import { ItemActions } from "@/components/item-actions"

const STATUS_STYLES: Record<string, string> = {
  DRAFT: "bg-gray-100 text-gray-600",
  READY: "bg-blue-100 text-blue-700",
  SENT: "bg-amber-100 text-amber-700",
  SIGNED: "bg-purple-100 text-purple-700",
  DEPOSIT_PAID: "bg-emerald-100 text-emerald-800",
  WON: "bg-emerald-100 text-emerald-700",
  LOST: "bg-red-100 text-red-600",
}

export default async function ProposalsPage() {
  const user = await getCurrentUser()
  if (!user) redirect("/auth/login")

  const proposals = await db.proposal.findMany({
    where: { organizationId: user.organizationId },
    orderBy: { updatedAt: "desc" },
    include: {
      pricingLineItems: true,
      survey: { select: { title: true } },
    },
  })

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold text-brand-navy">Proposals</h1>

      {proposals.length === 0 ? (
        <div className="bg-white rounded-xl shadow-sm p-10 text-center text-gray-400">
          Generate a proposal from one of your surveys and it will appear here.
        </div>
      ) : (
        <div className="bg-white rounded-xl shadow-sm divide-y">
          {proposals.map((p) => (
            <div key={p.id} className="flex items-center gap-1 pr-2 hover:bg-gray-50 transition">
              <Link href={`/proposals/${p.id}`}
                className="flex items-center justify-between gap-3 p-4 flex-1 min-w-0">
                <div className="min-w-0">
                  <div className="font-medium text-gray-900 truncate">{p.survey.title}</div>
                  <div className="text-sm text-gray-500 truncate">
                    {p.clientName} · {formatCurrency(calculateProposalTotals(p.pricingLineItems).total)} · {formatDate(p.updatedAt)}
                  </div>
                </div>
                <span className={`shrink-0 whitespace-nowrap text-xs font-semibold px-2.5 py-1 rounded-full ${STATUS_STYLES[p.status]}`}>
                  {p.status}
                </span>
              </Link>
              <ItemActions kind="proposal" id={p.id} surveyId={p.surveyId} title={p.survey.title} />
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
