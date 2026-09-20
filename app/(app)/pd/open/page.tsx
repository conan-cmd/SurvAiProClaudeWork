import { redirect } from "next/navigation"
import { db } from "@/lib/db"
import { getCurrentUser } from "@/lib/session"

// Target for the Pipedrive link action ("Open in SurvAIPro" on a deal).
// Pipedrive appends ?resource=deal&selectedIds=<id> — if this org already has
// a proposal linked to that deal we open it; otherwise fall through to
// creating a survey pre-filled from the deal (the original action's flow).
export default async function PipedriveOpenPage({
  searchParams,
}: {
  searchParams: { selectedIds?: string; resource?: string }
}) {
  const user = await getCurrentUser()
  if (!user) redirect("/auth/login")

  const dealId = searchParams.selectedIds?.split(",")[0]?.trim()
  if (!dealId) redirect("/proposals")

  const proposal = await db.proposal.findFirst({
    where: { organizationId: user.organizationId, pipedriveDealId: dealId },
    select: { id: true },
  })
  if (proposal) redirect(`/proposals/${proposal.id}`)

  redirect(`/surveys/new?pdDeal=${encodeURIComponent(dealId!)}`)
}
