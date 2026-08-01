import { NextResponse } from "next/server"
import { db } from "@/lib/db"
import { getCurrentUser } from "@/lib/session"
import { isApprover } from "@/lib/permissions"

// Proposals awaiting the current approver's sign-off (org-wide).
export async function GET() {
  const user = await getCurrentUser()
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  if (!isApprover(user)) return NextResponse.json({ proposals: [], count: 0 })

  const proposals = await db.proposal.findMany({
    where: { organizationId: user.organizationId, approvalStatus: "PENDING" },
    select: {
      id: true,
      clientName: true,
      submittedAt: true,
      submittedById: true,
      survey: { select: { title: true, clientAddress: true } },
    },
    orderBy: { submittedAt: "asc" },
  })

  // Resolve submitter names in one query.
  const ids = [...new Set(proposals.map((p) => p.submittedById).filter(Boolean) as string[])]
  const submitters = ids.length
    ? await db.user.findMany({ where: { id: { in: ids } }, select: { id: true, name: true, email: true } })
    : []
  const byId = new Map(submitters.map((s) => [s.id, s.name || s.email]))

  return NextResponse.json({
    count: proposals.length,
    proposals: proposals.map((p) => ({
      id: p.id,
      clientName: p.clientName,
      title: p.survey.title,
      address: p.survey.clientAddress,
      submittedAt: p.submittedAt,
      submittedBy: p.submittedById ? byId.get(p.submittedById) || "Someone" : "Someone",
    })),
  })
}
