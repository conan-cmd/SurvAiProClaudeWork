import { NextRequest, NextResponse } from "next/server"
import { z } from "zod"
import { db } from "@/lib/db"
import { getCurrentUser } from "@/lib/session"
import { linkProposalToDeal, unlinkProposalDeal } from "@/lib/pipedrive"

const bodySchema = z.object({
  // A deal id links; null unlinks (clears deal + person + org refs).
  dealId: z.number().int().positive().nullable(),
})

export async function POST(
  request: NextRequest,
  { params }: { params: { proposalId: string } }
) {
  const user = await getCurrentUser()
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  const parsed = bodySchema.safeParse(await request.json().catch(() => ({})))
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.errors[0].message }, { status: 400 })
  }

  const proposal = await db.proposal.findFirst({
    where: { id: params.proposalId, organizationId: user.organizationId },
    select: { id: true },
  })
  if (!proposal) return NextResponse.json({ error: "Not found" }, { status: 404 })

  try {
    if (parsed.data.dealId === null) await unlinkProposalDeal(proposal.id)
    else await linkProposalToDeal(proposal.id, parsed.data.dealId)
    return NextResponse.json({ success: true, dealId: parsed.data.dealId })
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Couldn't link the deal" },
      { status: 502 }
    )
  }
}
