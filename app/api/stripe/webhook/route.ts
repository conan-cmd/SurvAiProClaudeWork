import { NextRequest, NextResponse } from "next/server"
import { db } from "@/lib/db"
import { verifyWebhook, retrieveSubscription } from "@/lib/stripe"
import { applySubscription } from "@/lib/billing"
import { sendGhlEvent } from "@/lib/ghl"
import { publicBaseUrl } from "@/lib/public-url"

// Keeps each org's subscription status in sync with Stripe (renewals, cancels,
// failed payments) so access is granted/revoked automatically — and forwards the
// lifecycle event to GoHighLevel so it can run the win-back / dunning sequences.
export async function POST(request: NextRequest) {
  const secret = process.env.STRIPE_WEBHOOK_SECRET
  if (!secret) return NextResponse.json({ error: "Webhook not configured" }, { status: 503 })

  const payload = await request.text()
  const event = await verifyWebhook(payload, request.headers.get("stripe-signature"), secret)
  if (!event) return NextResponse.json({ error: "Invalid signature" }, { status: 400 })

  const type = event.type as string
  const obj = ((event.data as { object?: Record<string, unknown> } | undefined)?.object || {}) as Record<string, unknown>

  try {
    if (type === "checkout.session.completed") {
      const subId = obj.subscription as string | undefined
      if (subId) {
        const sub = await retrieveSubscription(subId)
        await applySubscription(sub)
      }
      await forwardToGhl(obj.customer as string | undefined, "trial_started", null, request.nextUrl.origin)
    } else if (type.startsWith("customer.subscription.")) {
      await applySubscription(obj as Parameters<typeof applySubscription>[0])
      const status = obj.status as string | undefined
      // Map the subscription change to a lifecycle event GHL can trigger off.
      const ghlEvent =
        type === "customer.subscription.trial_will_end" ? "trial_ending"
        : type === "customer.subscription.deleted" || status === "canceled" ? "subscription_canceled"
        : status === "past_due" || status === "unpaid" ? "payment_failed"
        : status === "active" ? "subscription_active"
        : null
      if (ghlEvent) await forwardToGhl(obj.customer as string | undefined, ghlEvent, status ?? null, request.nextUrl.origin)
    } else if (type === "invoice.payment_failed") {
      await forwardToGhl(obj.customer as string | undefined, "payment_failed", "past_due", request.nextUrl.origin)
    }
  } catch (error) {
    console.error("Webhook handling error:", error)
    // Return 200 anyway so Stripe doesn't hammer retries on a transient error.
  }

  return NextResponse.json({ received: true })
}

// Resolves the org (and its owner's contact) from the Stripe customer id and
// forwards the event to GoHighLevel.
async function forwardToGhl(customerId: string | undefined, ghlEvent: string, status: string | null, origin: string) {
  if (!customerId || !process.env.GHL_WEBHOOK_URL) return
  const org = await db.organization.findFirst({
    where: { stripeCustomerId: customerId },
    select: {
      name: true, email: true, subscriptionPlan: true,
      users: { where: { role: "OWNER" }, select: { email: true, name: true }, take: 1 },
    },
  })
  if (!org) return
  const owner = org.users[0]
  const email = owner?.email || org.email
  if (!email) return
  await sendGhlEvent({
    event: ghlEvent,
    email,
    name: owner?.name || null,
    company: org.name,
    plan: org.subscriptionPlan,
    status,
    billingUrl: `${publicBaseUrl(origin)}/settings`,
  })
}
