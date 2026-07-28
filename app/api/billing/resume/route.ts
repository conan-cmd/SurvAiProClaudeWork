import { NextResponse } from "next/server"
import { db } from "@/lib/db"
import { getCurrentUser } from "@/lib/session"
import { stripeEnabled, resumeSubscription } from "@/lib/stripe"

// Resumes a paused subscription (or clears a pending cancellation).
export async function POST() {
  const user = await getCurrentUser()
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  if (!stripeEnabled()) return NextResponse.json({ error: "Billing isn't configured." }, { status: 503 })

  const org = await db.organization.findUnique({
    where: { id: user.organizationId },
    select: { id: true, subscriptionId: true },
  })
  if (!org?.subscriptionId) return NextResponse.json({ error: "No subscription found." }, { status: 400 })

  try {
    await resumeSubscription(org.subscriptionId)
    await db.organization.update({
      where: { id: org.id },
      data: { subscriptionPausedUntil: null },
    })
    return NextResponse.json({ success: true })
  } catch (error) {
    console.error("Resume error:", error)
    const msg = error instanceof Error ? error.message : "Couldn't resume your subscription."
    return NextResponse.json({ error: msg }, { status: 500 })
  }
}
