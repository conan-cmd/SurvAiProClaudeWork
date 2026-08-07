import { redirect } from "next/navigation"
import { getCurrentUser } from "@/lib/session"
import { db } from "@/lib/db"
import { retrieveCheckoutSession, retrieveSubscription, FOUNDING_LIMIT } from "@/lib/stripe"
import { coinbaseEnabled } from "@/lib/coinbase"
import { hasActiveAccess, applySubscription } from "@/lib/billing"
import { SubscribePlans } from "@/components/subscribe-plans"

export const dynamic = "force-dynamic"

export default async function SubscribePage({
  searchParams,
}: {
  searchParams: { session_id?: string }
}) {
  const user = await getCurrentUser()
  if (!user) redirect("/auth/login")

  // Returning from Stripe Checkout — record the subscription immediately so
  // access is granted without waiting for the webhook.
  if (searchParams.session_id) {
    try {
      const session = await retrieveCheckoutSession(searchParams.session_id)
      if (session.subscription) {
        const sub = await retrieveSubscription(session.subscription as string)
        await applySubscription(sub)
      }
    } catch (e) {
      console.error("Subscribe verify failed:", e)
    }
    redirect("/onboarding/branding")
  }

  const org = await db.organization.findUnique({
    where: { id: user.organizationId },
    select: {
      billingExempt: true, freeAccess: true, subscriptionStatus: true,
      subscriptionPausedUntil: true, cryptoAccessUntil: true,
    },
  })
  // Already have access → no need for the paywall.
  if (org && hasActiveAccess(org)) redirect("/dashboard")

  const cryptoEnabled = coinbaseEnabled()

  // Paused → offer to resume rather than re-subscribe.
  const paused = org?.subscriptionPausedUntil && org.subscriptionPausedUntil.getTime() > Date.now()
  if (paused) {
    return <SubscribePlans pausedUntil={org!.subscriptionPausedUntil!.toISOString()} cryptoEnabled={cryptoEnabled} />
  }

  const foundingUsed = await db.organization.count({ where: { isFoundingMember: true } })
  const founding = foundingUsed < FOUNDING_LIMIT

  return (
    <SubscribePlans
      founding={founding}
      slotsLeft={Math.max(0, FOUNDING_LIMIT - foundingUsed)}
      lapsed={org?.subscriptionStatus === "canceled" || org?.subscriptionStatus === "unpaid"}
      cryptoEnabled={cryptoEnabled}
    />
  )
}
