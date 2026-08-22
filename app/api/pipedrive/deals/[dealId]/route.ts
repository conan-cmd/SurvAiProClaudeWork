import { NextRequest, NextResponse } from "next/server"
import { db } from "@/lib/db"
import { getCurrentUser } from "@/lib/session"
import { pipedriveConfigured, dealPrefill, PIPEDRIVE_SELECT } from "@/lib/pipedrive"

// Prefill data for starting a survey from a Pipedrive deal.
export async function GET(
  _request: NextRequest,
  { params }: { params: { dealId: string } }
) {
  const user = await getCurrentUser()
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  const dealId = parseInt(params.dealId, 10)
  if (!Number.isFinite(dealId) || dealId <= 0) {
    return NextResponse.json({ error: "Invalid deal id" }, { status: 400 })
  }

  const org = await db.organization.findUnique({
    where: { id: user.organizationId },
    select: PIPEDRIVE_SELECT,
  })
  if (!org || !pipedriveConfigured(org)) {
    return NextResponse.json({ error: "Pipedrive isn't connected — connect it in Settings first." }, { status: 400 })
  }

  try {
    return NextResponse.json(await dealPrefill(org, dealId))
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Couldn't load the deal" },
      { status: 502 }
    )
  }
}
