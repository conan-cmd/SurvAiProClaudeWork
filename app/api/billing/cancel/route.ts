import { NextRequest, NextResponse } from "next/server"
import { z } from "zod"
import { db } from "@/lib/db"
import { getCurrentUser } from "@/lib/session"
import { stripeEnabled, pauseSubscription, cancelSubscriptionAtPeriodEnd } from "@/lib/stripe"
import { sendGhlEvent } from "@/lib/ghl"
import { publicBaseUrl } from "@/lib/public-url"

const schema = z.object({
  action: z.enum(["pause", "cancel"]),
  reason: z.string().max(500).optional(),
  pauseMonths: z.number().int().min(1).max(3).optional(),
})

// Retention flow: capture a reason and either pause billing or cancel at period end.
export async function POST(request: NextRequest) {
  const user = await getCurrentUser()
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  if (!stripeEnabled()) return NextResponse.json({ error: "Billing isn't configured." }, { status: 503 })

  const parsed = schema.safeParse(await request.json())
  if (!parsed.success) return NextResponse.json({ error: "Invalid request" }, { status: 400 })
  const { action, reason, pauseMonths } = parsed.data

  const org = await db.organization.findUnique({
    where: { id: user.organizationId },
    select: {
      id: true, name: true, email: true, subscriptionId: true, subscriptionPlan: true,
      users: { where: { role: "OWNER" }, select: { email: true, name: true }, take: 1 },
    },
  })
  if (!org?.subscriptionId) {
    return NextResponse.json({ error: "No active subscription to change." }, { status: 400 })
  }

  try {
    if (action === "pause") {
      const months = pauseMonths || 1
      const resumesAt = Math.floor(Date.now() / 1000) + months * 30 * 86400
      await pauseSubscription(org.subscriptionId, resumesAt)
      await db.organization.update({
        where: { id: org.id },
        data: { cancelReason: reason || null, subscriptionPausedUntil: new Date(resumesAt * 1000) },
      })
    } else {
      await cancelSubscriptionAtPeriodEnd(org.subscriptionId)
      await db.organization.update({
        where: { id: org.id },
        data: { cancelReason: reason || null },
      })
    }

    // Forward to GHL for the win-back / pause nurture, with the reason.
    const owner = org.users[0]
    const email = owner?.email || org.email
    if (email) {
      await sendGhlEvent({
        event: action === "pause" ? "subscription_paused" : "subscription_canceled",
        email,
        name: owner?.name || null,
        company: org.name,
        plan: org.subscriptionPlan,
        status: reason ? `reason: ${reason}` : null,
        billingUrl: `${publicBaseUrl(request.nextUrl.origin)}/settings`,
      }).catch(() => {})
    }

    return NextResponse.json({ success: true })
  } catch (error) {
    console.error("Cancel/pause error:", error)
    const msg = error instanceof Error ? error.message : "Couldn't update your subscription."
    return NextResponse.json({ error: msg }, { status: 500 })
  }
}
