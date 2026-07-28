import { NextRequest, NextResponse } from "next/server"
import { verifyWebhook, retrieveSubscription } from "@/lib/stripe"
import { applySubscription } from "@/lib/billing"

// Keeps each org's subscription status in sync with Stripe (renewals, cancels,
// failed payments) so access is granted/revoked automatically.
export async function POST(request: NextRequest) {
  const secret = process.env.STRIPE_WEBHOOK_SECRET
  if (!secret) return NextResponse.json({ error: "Webhook not configured" }, { status: 503 })

  const payload = await request.text()
  const event = await verifyWebhook(payload, request.headers.get("stripe-signature"), secret)
  if (!event) return NextResponse.json({ error: "Invalid signature" }, { status: 400 })

  const type = event.type as string
  const obj = (event.data as { object?: Record<string, unknown> } | undefined)?.object || {}

  try {
    if (type === "checkout.session.completed") {
      // A subscription checkout finished — pull the subscription and record it.
      const subId = obj.subscription as string | undefined
      if (subId) {
        const sub = await retrieveSubscription(subId)
        await applySubscription(sub)
      }
    } else if (type.startsWith("customer.subscription.")) {
      // created / updated / deleted / trial_will_end
      await applySubscription(obj as Parameters<typeof applySubscription>[0])
    }
  } catch (error) {
    console.error("Webhook handling error:", error)
    // Return 200 anyway so Stripe doesn't hammer retries on a transient error.
  }

  return NextResponse.json({ received: true })
}
