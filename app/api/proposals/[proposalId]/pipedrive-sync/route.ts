import { NextRequest, NextResponse } from "next/server"
import { db } from "@/lib/db"
import { getCurrentUser } from "@/lib/session"
import { syncProposalToPipedrive } from "@/lib/pipedrive"

// Manual push: create/update this proposal's Pipedrive person + org + deal
// (the automatic sync only fires on send and status changes).
export async function POST(
  _request: NextRequest,
  { params }: { params: { proposalId: string } }
) {
  const user = await getCurrentUser()
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  const proposal = await db.proposal.findFirst({
    where: { id: params.proposalId, organizationId: user.organizationId },
    select: { id: true },
  })
  if (!proposal) return NextResponse.json({ error: "Not found" }, { status: 404 })

  await syncProposalToPipedrive(proposal.id)

  // The sync is best-effort and swallows errors — verify the outcome so the
  // user gets an honest answer instead of a fake success.
  const after = await db.proposal.findUnique({
    where: { id: proposal.id },
    select: { pipedriveDealId: true },
  })
  if (!after?.pipedriveDealId) {
    return NextResponse.json(
      { error: "Couldn't create the deal — check Pipedrive is connected in Settings." },
      { status: 502 }
    )
  }
  return NextResponse.json({ success: true, dealId: after.pipedriveDealId })
}
