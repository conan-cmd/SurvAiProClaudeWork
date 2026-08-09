import { NextRequest, NextResponse } from "next/server"
import { db } from "@/lib/db"
import { getCurrentUser } from "@/lib/session"
import { pipedriveConfigured, searchPersons, PIPEDRIVE_SELECT } from "@/lib/pipedrive"

// Searches the firm's Pipedrive contacts so a survey can be started from one.
export async function GET(request: NextRequest) {
  const user = await getCurrentUser()
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  const org = await db.organization.findUnique({
    where: { id: user.organizationId },
    select: PIPEDRIVE_SELECT,
  })
  if (!org || !pipedriveConfigured(org)) {
    return NextResponse.json({ error: "Pipedrive isn't connected." }, { status: 400 })
  }

  const q = request.nextUrl.searchParams.get("q") || ""
  try {
    const people = await searchPersons(org, q)
    return NextResponse.json(people)
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Pipedrive search failed." },
      { status: 502 }
    )
  }
}
