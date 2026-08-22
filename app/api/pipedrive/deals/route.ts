import { NextRequest, NextResponse } from "next/server"
import { db } from "@/lib/db"
import { getCurrentUser } from "@/lib/session"
import {
  pipedriveConfigured, searchDeals, suggestDealsForClient, recentOpenDeals, PIPEDRIVE_SELECT,
} from "@/lib/pipedrive"

// Finds Pipedrive deals to link a proposal to. Three modes:
//  ?q=…            → title search ("search")
//  ?name=…&email=… → the client's persons' deals ("suggested"), falling back
//                    to the newest open deals ("recent") when none match
export async function GET(request: NextRequest) {
  const user = await getCurrentUser()
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  const org = await db.organization.findUnique({
    where: { id: user.organizationId },
    select: PIPEDRIVE_SELECT,
  })
  if (!org || !pipedriveConfigured(org)) {
    return NextResponse.json({ error: "Pipedrive isn't connected — connect it in Settings first." }, { status: 400 })
  }

  const q = request.nextUrl.searchParams.get("q") || ""
  const name = request.nextUrl.searchParams.get("name") || ""
  const email = request.nextUrl.searchParams.get("email") || ""

  try {
    if (q.trim()) {
      return NextResponse.json({ mode: "search", deals: await searchDeals(org, q) })
    }
    if (name.trim() || email.trim()) {
      const suggested = await suggestDealsForClient(org, name, email || null)
      if (suggested.length) return NextResponse.json({ mode: "suggested", deals: suggested })
    }
    return NextResponse.json({ mode: "recent", deals: await recentOpenDeals(org) })
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Pipedrive search failed" },
      { status: 502 }
    )
  }
}
