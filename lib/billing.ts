import "server-only"
import { db } from "./db"
import { stripeEnabled } from "./stripe"

// Access is granted while trialing/active (or past_due — Stripe is still retrying),
// or if the org is exempt (existing/comped). Billing off entirely → open access.
export function hasActiveAccess(org: { billingExempt: boolean; subscriptionStatus: string | null }): boolean {
  if (!stripeEnabled()) return true
  if (org.billingExempt) return true
  return ["trialing", "active", "past_due"].includes(org.subscriptionStatus || "")
}

// Writes a Stripe subscription's state onto the owning organization. Resolves the
// org via subscription metadata, falling back to the stored customer id.
export async function applySubscription(sub: {
  id?: string
  status?: string
  current_period_end?: number
  customer?: string
  metadata?: { organizationId?: string; plan?: string; founding?: string }
}): Promise<void> {
  const orgId = sub.metadata?.organizationId
  const where = orgId ? { id: orgId } : sub.customer ? { stripeCustomerId: sub.customer } : null
  if (!where) return

  await db.organization.updateMany({
    where,
    data: {
      subscriptionId: sub.id ?? undefined,
      subscriptionStatus: sub.status ?? undefined,
      subscriptionPlan: sub.metadata?.plan ?? undefined,
      currentPeriodEnd: sub.current_period_end ? new Date(sub.current_period_end * 1000) : undefined,
      ...(sub.customer ? { stripeCustomerId: sub.customer } : {}),
      // Lock in founding status the first time we see it true (never demote).
      ...(sub.metadata?.founding === "true" ? { isFoundingMember: true } : {}),
    },
  })
}
