import { NextResponse } from "next/server"
import { getCurrentUser } from "@/lib/session"
import { isPlatformAdmin } from "@/lib/admin"
import { ghlEnabled, sendGhlEvent } from "@/lib/ghl"

// Admin-only: fires a realistic sample `trial_started` event at GHL so Damian can
// map the fields and finish saving the workflows.
export async function POST() {
  const user = await getCurrentUser()
  if (!isPlatformAdmin(user)) return NextResponse.json({ error: "Forbidden" }, { status: 403 })
  if (!ghlEnabled()) {
    return NextResponse.json(
      { error: "GHL_WEBHOOK_URL isn't set on the host yet — add it in Vercel first." },
      { status: 503 }
    )
  }

  const result = await sendGhlEvent({
    event: "trial_started",
    email: user!.email,
    name: user!.name || "Test Signup",
    company: user!.organization?.name || "Test Company",
    phone: user!.organization?.phone || null,
    plan: "annual",
    organizationId: user!.organizationId,
    surveysCount: 0,
    proposalsCount: 0,
    ramsCount: 0,
    signedUpAt: new Date().toISOString(),
    test: true,
  })

  if (!result.ok) {
    return NextResponse.json({ error: result.error || `GHL returned ${result.status}` }, { status: 502 })
  }
  return NextResponse.json({ success: true, status: result.status })
}
