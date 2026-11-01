import { NextRequest, NextResponse } from "next/server"
import { getCurrentUser } from "@/lib/session"
import { processDueScheduledNudges } from "@/lib/scheduled-nudges"

export const maxDuration = 60

// Scheduled-nudge dispatcher. GET = the Vercel cron (all orgs); POST = the
// traffic beacon fired on page loads (processes just that user's org).
export async function GET(request: NextRequest) {
  const fromVercelCron = request.headers.get("x-vercel-cron") !== null
  const secret = process.env.CRON_SECRET
  const authed = secret
    ? request.headers.get("authorization") === `Bearer ${secret}`
    : fromVercelCron
  if (!authed && !fromVercelCron) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }
  const sent = await processDueScheduledNudges()
  return NextResponse.json({ sent })
}

export async function POST() {
  const user = await getCurrentUser()
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  const sent = await processDueScheduledNudges(user.organizationId)
  return NextResponse.json({ sent })
}
