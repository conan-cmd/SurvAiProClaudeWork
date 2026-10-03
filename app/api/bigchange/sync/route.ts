import { NextResponse } from "next/server"
import { getCurrentUser } from "@/lib/session"
import { syncSurveyBookings } from "@/lib/bigchange"

// Pull booked survey jobs from BigChange into SurvAIPro as scheduled site
// surveys (deduped by externalBookingRef).
export async function POST() {
  const user = await getCurrentUser()
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  if (user.role === "CONTRACTOR") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 })
  }
  try {
    const result = await syncSurveyBookings(user.organizationId, user.id)
    return NextResponse.json(result)
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Sync failed" },
      { status: 502 }
    )
  }
}
