import { NextRequest, NextResponse } from "next/server"
import { db } from "@/lib/db"
import { verifyWebhook, retrieveSubscription } from "@/lib/stripe"
import { applySubscription } from "@/lib/billing"
import { markDepositPaid } from "@/lib/deposit"
import { sendGhlEvent } from "@/lib/ghl"
import { publicBaseUrl } from "@/lib/public-url"

// Keeps each org's subscription status in sync with Stripe (renewals, cancels,
// failed payments) so access is granted/revoked automatically — and forwards the
// lifecycle event to GoHighLevel so it can run the win-back / dunning sequences.
// Also records client deposit payments (checkout sessions created on the firms'
// CONNECTED accounts), so a deposit is captured even when the client never
// returns to the proposal page after paying. Those connected-account events
// arrive via a separate Stripe "connected accounts" endpoint with its own
// signing secret — both secrets are accepted here.
export async function POST(request: NextRequest) {
  const secrets = [process.env.STRIPE_WEBHOOK_SECRET, process.env.STRIPE_CONNECT_WEBHOOK_SECRET]
    .filter((s): s is string => Boolean(s))
  if (!secrets.length) return NextResponse.json({ error: "Webhook not configured" }, { status: 503 })

  const payload = await request.text()
  let event: Record<string, unknown> | null = null
  for (const secret of secrets) {
    event = await verifyWebhook(payload, request.headers.get("stripe-signature"), secret)
    if (event) break
  }
  if (!event) return NextResponse.json({ error: "Invalid signature" }, { status: 400 })

  const type = event.type as string
  const obj = ((event.data as { object?: Record<string, unknown> } | undefined)?.object || {}) as Record<string, unknown>
  // Set on events from a firm's connected account. A linked EXISTING account also
  // sends us its own unrelated business (its subscriptions, other checkouts), so
  // platform-billing handling must only ever run on the platform's own events.
  const connectedAccount = event.account as string | undefined

  try {
    if (type === "account.application.deauthorized" && connectedAccount) {
      // The firm disconnected SurvAIPro from their Stripe dashboard — stop routing
      // deposits to an account we can no longer charge on.
      await db.organization.updateMany({
        where: { stripeAccountId: connectedAccount },
        data: { stripeAccountId: null, stripeChargesEnabled: false },
      })
    } else if (type === "account.updated" && typeof obj.id === "string") {
      await db.organization.updateMany({
        where: { stripeAccountId: obj.id },
        data: { stripeChargesEnabled: Boolean(obj.charges_enabled) },
      })
    } else if (type === "checkout.session.completed" || type === "checkout.session.async_payment_succeeded") {
      const subId = obj.subscription as string | undefined
      if (subId) {
        if (connectedAccount) return NextResponse.json({ received: true })
        const sub = await retrieveSubscription(subId)
        await applySubscription(sub)
        await forwardToGhl(obj.customer as string | undefined, "trial_started", null, request.nextUrl.origin)
      } else if (obj.payment_status === "paid") {
        // One-off payment session = a client deposit. The proposal id rides in
        // the session metadata; older sessions are matched by stored session id.
        let proposalId = (obj.metadata as Record<string, unknown> | undefined)?.proposalId as string | undefined
        if (!proposalId && typeof obj.id === "string") {
          const match = await db.proposal.findFirst({
            where: { stripeSessionId: obj.id },
            select: { id: true },
          })
          proposalId = match?.id
        }
        if (proposalId) await markDepositPaid(proposalId)
      }
    } else if (connectedAccount) {
      // Nothing else from connected accounts concerns us.
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
