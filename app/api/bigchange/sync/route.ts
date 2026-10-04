import { NextRequest, NextResponse } from "next/server"
import { getCurrentUser } from "@/lib/session"
import { syncSurveyBookings, syncIfDue } from "@/lib/bigchange"

// Pull booked survey jobs from BigChange into SurvAIPro as scheduled site
// surveys (deduped by externalBookingRef). ?auto=1 is the quiet background
// variant fired on Surveys page loads — throttled and never user-facing.
export async function POST(request: NextRequest) {
  const user = await getCurrentUser()
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  if (user.role === "CONTRACTOR") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 })
  }
  try {
    const result = request.nextUrl.searchParams.get("auto")
      ? await syncIfDue(user.organizationId, user.id)
      : await syncSurveyBookings(user.organizationId, user.id)
    return NextResponse.json(result)
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Sync failed" },
      { status: 502 }
    )
  }
}
