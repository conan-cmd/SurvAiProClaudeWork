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

  try {
    if (type === "checkout.session.completed" || type === "checkout.session.async_payment_succeeded") {
      const subId = obj.subscription as string | undefined
      if (subId) {
        const sub = await retrieveSubscription(subId)
        await applySubscription(sub)
        await forwardToGhl(obj.customer as string | undefined, "trial_started", null, request.nextUrl.origin)
        // Tell the platform admins a trial just started (checkout completes
        // exactly once, so no dedupe needed). Best-effort.
        if ((sub as { status?: string }).status === "trialing") {
          notifyTrialStarted(sub as TrialSub, request.nextUrl.origin).catch((err) =>
            console.error("Trial alert failed:", err)
          )
        }
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

type TrialSub = {
  customer?: string
  trial_end?: number
  metadata?: { organizationId?: string; plan?: string; founding?: string }
}

// "🎉 new trial" email to the platform admin list, with the essentials for a
// personal welcome: who, which firm, what plan, and the admin drill-down link.
async function notifyTrialStarted(sub: TrialSub, origin: string) {
  const { emailEnabled, sendEmail } = await import("@/lib/email")
  if (!emailEnabled()) return
  const { adminEmails } = await import("@/lib/admin")

  const orgId = sub.metadata?.organizationId
  const org = await db.organization.findFirst({
    where: orgId ? { id: orgId } : { stripeCustomerId: sub.customer },
    select: {
      name: true, website: true, trade: true, createdAt: true,
      users: { where: { role: "OWNER" }, select: { name: true, email: true }, take: 1 },
    },
  })
  if (!org) return
  const owner = org.users[0]
  const plan = sub.metadata?.plan === "annual" ? "Annual" : "Monthly"
  const founding = sub.metadata?.founding === "true" ? " · founding price" : ""
  const trialEnds = sub.trial_end
    ? new Date(sub.trial_end * 1000).toLocaleDateString("en-GB", { day: "numeric", month: "short" })
    : null
  const usageUrl = `${publicBaseUrl(origin)}/admin/usage`

  await sendEmail({
    to: adminEmails(),
    subject: `🎉 New SurvAIPro trial — ${org.name}`,
    html: `
      <div style="font-family:-apple-system,'Segoe UI',Roboto,Arial,sans-serif;font-size:15px;line-height:1.7;color:#111827;max-width:540px">
        <p><strong>${org.name}</strong> just started a free trial (${plan}${founding}${trialEnds ? `, converts ${trialEnds}` : ""}).</p>
        <p style="margin:4px 0">
          ${owner ? `${owner.name || "Owner"} — <a href="mailto:${owner.email}">${owner.email}</a><br/>` : ""}
          ${org.website ? `<a href="${org.website}">${org.website}</a><br/>` : ""}
          ${org.trade ? `Trade: ${org.trade}` : ""}
        </p>
        <p style="margin:16px 0"><a href="${usageUrl}" style="color:#2563EB;font-weight:600">Open the account in Admin &rarr;</a></p>
        <p style="color:#6b7280;font-size:13px">A personal hello in their first hour converts trials — the admin page can send one in two clicks.</p>
      </div>`,
    text: `${org.name} just started a free trial (${plan}${founding}).${owner ? ` Owner: ${owner.name || ""} ${owner.email}.` : ""}\n\n${usageUrl}`,
  })
}
