import "server-only"

// Minimal Stripe REST client (no SDK dependency). Test/live mode follows the key.
const STRIPE_API = "https://api.stripe.com/v1"

export function stripeEnabled(): boolean {
  return Boolean(process.env.STRIPE_SECRET_KEY)
}

function form(data: Record<string, string>): string {
  return Object.entries(data)
    .map(([k, v]) => `${encodeURIComponent(k)}=${encodeURIComponent(v)}`)
    .join("&")
}

// `stripeAccount` performs the request AS a connected account (direct charges).
async function stripeFetch(
  path: string,
  body?: Record<string, string>,
  stripeAccount?: string
) {
  const res = await fetch(`${STRIPE_API}${path}`, {
    method: body ? "POST" : "GET",
    headers: {
      Authorization: `Bearer ${process.env.STRIPE_SECRET_KEY}`,
      ...(body && { "Content-Type": "application/x-www-form-urlencoded" }),
      ...(stripeAccount && { "Stripe-Account": stripeAccount }),
    },
    body: body ? form(body) : undefined,
    signal: AbortSignal.timeout(15000),
  })
  const data = await res.json()
  if (!res.ok) throw new Error(data.error?.message || `Stripe ${res.status}`)
  return data
}

// --- Stripe Connect (Express) — a firm's own account so deposits pay them directly ---

// Creates an Express connected account for a firm. Returns the account object.
export async function createConnectedAccount(email: string | null): Promise<{ id: string }> {
  return stripeFetch("/accounts", {
    type: "express",
    country: "GB",
    "capabilities[card_payments][requested]": "true",
    "capabilities[transfers][requested]": "true",
    ...(email ? { email } : {}),
    "business_type": "company",
  })
}

// Onboarding/verification link the firm completes to enable payouts.
export async function createAccountLink(accountId: string, refreshUrl: string, returnUrl: string): Promise<{ url: string }> {
  return stripeFetch("/account_links", {
    account: accountId,
    refresh_url: refreshUrl,
    return_url: returnUrl,
    type: "account_onboarding",
  })
}

// Current status of a connected account (charges_enabled once onboarding is done).
export async function retrieveAccount(accountId: string): Promise<{
  id: string; charges_enabled: boolean; details_submitted: boolean; payouts_enabled: boolean
}> {
  return stripeFetch(`/accounts/${encodeURIComponent(accountId)}`)
}

export async function createDepositCheckout(params: {
  amountPence: number
  proposalTitle: string
  companyName: string
  proposalId: string
  successUrl: string
  cancelUrl: string
  customerEmail?: string | null
  // When set, the charge is created directly on the firm's connected account, so
  // the deposit settles in their Stripe balance and pays out to their bank.
  connectedAccountId?: string | null
}) {
  const body: Record<string, string> = {
    mode: "payment",
    "line_items[0][price_data][currency]": "gbp",
    "line_items[0][price_data][unit_amount]": String(params.amountPence),
    "line_items[0][price_data][product_data][name]": `Deposit - ${params.proposalTitle}`,
    "line_items[0][price_data][product_data][description]": `Payable to ${params.companyName}`,
    "line_items[0][quantity]": "1",
    success_url: params.successUrl,
    cancel_url: params.cancelUrl,
    "metadata[proposalId]": params.proposalId,
  }
  if (params.customerEmail) body.customer_email = params.customerEmail
  return stripeFetch("/checkout/sessions", body, params.connectedAccountId || undefined)
}

// Pass the connected account id if the session was created on that account.
export async function retrieveCheckoutSession(sessionId: string, connectedAccountId?: string | null) {
  return stripeFetch(`/checkout/sessions/${encodeURIComponent(sessionId)}`, undefined, connectedAccountId || undefined)
}

// --- Platform subscription billing (SurvAIPro charges the firm) ---

export type PlanKey = "monthly" | "annual"

// First 100 firms get founding pricing (£49/mo · £499/yr), locked in for life.
// Everyone after pays standard (£99/mo · £990/yr).
export const FOUNDING_LIMIT = 100
export const PRICING = {
  founding: {
    monthly: { amountPence: 4900, price: "£49", sub: "per month" },
    annual: { amountPence: 49900, price: "£499", sub: "per year (£41.58/mo)" },
  },
  standard: {
    monthly: { amountPence: 9900, price: "£99", sub: "per month" },
    annual: { amountPence: 99000, price: "£990", sub: "per year (£82.50/mo)" },
  },
} as const

// Checkout for a subscription with a 14-day trial. Card is collected up front
// (Checkout subscription mode) so it auto-converts unless cancelled. The exact
// price is passed in (founding vs standard) and Stripe locks it for that sub.
export async function createSubscriptionCheckout(params: {
  plan: PlanKey
  amountPence: number
  founding: boolean
  organizationId: string
  customerId?: string | null
  customerEmail?: string | null
  successUrl: string
  cancelUrl: string
}) {
  const interval = params.plan === "annual" ? "year" : "month"
  const name = `SurvAIPro — ${params.founding ? "Founding " : ""}${params.plan === "annual" ? "Annual" : "Monthly"}`
  const body: Record<string, string> = {
    mode: "subscription",
    "line_items[0][price_data][currency]": "gbp",
    "line_items[0][price_data][recurring][interval]": interval,
    "line_items[0][price_data][unit_amount]": String(params.amountPence),
    "line_items[0][price_data][product_data][name]": name,
    "line_items[0][quantity]": "1",
    "subscription_data[trial_period_days]": "14",
    "subscription_data[metadata][organizationId]": params.organizationId,
    "subscription_data[metadata][plan]": params.plan,
    "subscription_data[metadata][founding]": params.founding ? "true" : "false",
    "metadata[organizationId]": params.organizationId,
    payment_method_collection: "always",
    allow_promotion_codes: "true",
    success_url: params.successUrl,
    cancel_url: params.cancelUrl,
  }
  if (params.customerId) body.customer = params.customerId
  else if (params.customerEmail) body.customer_email = params.customerEmail
  return stripeFetch("/checkout/sessions", body)
}

export async function retrieveSubscription(subscriptionId: string) {
  return stripeFetch(`/subscriptions/${encodeURIComponent(subscriptionId)}`)
}

// Cancels at the end of the paid period (they keep access until it runs out).
export async function cancelSubscriptionAtPeriodEnd(subscriptionId: string) {
  return stripeFetch(`/subscriptions/${encodeURIComponent(subscriptionId)}`, { cancel_at_period_end: "true" })
}

// Pauses billing until `resumesAtUnix`. Access is blocked while paused.
export async function pauseSubscription(subscriptionId: string, resumesAtUnix: number) {
  return stripeFetch(`/subscriptions/${encodeURIComponent(subscriptionId)}`, {
    "pause_collection[behavior]": "void",
    "pause_collection[resumes_at]": String(resumesAtUnix),
  })
}

// Clears any pause and any pending cancellation — back to active.
export async function resumeSubscription(subscriptionId: string) {
  return stripeFetch(`/subscriptions/${encodeURIComponent(subscriptionId)}`, {
    pause_collection: "",
    cancel_at_period_end: "false",
  })
}

// Stripe-hosted portal so users manage/cancel/update card themselves.
export async function createBillingPortal(customerId: string, returnUrl: string): Promise<{ url: string }> {
  return stripeFetch("/billing_portal/sessions", { customer: customerId, return_url: returnUrl })
}

// Verifies a Stripe webhook signature (t=..,v1=..) without the SDK. Returns the
// parsed event on success, or null if the signature doesn't check out.
export async function verifyWebhook(payload: string, sigHeader: string | null, secret: string): Promise<Record<string, unknown> | null> {
  if (!sigHeader) return null
  const parts = Object.fromEntries(sigHeader.split(",").map((kv) => kv.split("=")))
  const t = parts["t"]
  const v1 = parts["v1"]
  if (!t || !v1) return null
  const { createHmac, timingSafeEqual } = await import("crypto")
  const expected = createHmac("sha256", secret).update(`${t}.${payload}`).digest("hex")
  try {
    if (!timingSafeEqual(Buffer.from(expected), Buffer.from(v1))) return null
  } catch {
    return null
  }
  try {
    return JSON.parse(payload)
  } catch {
    return null
  }
}

export type DepositRule = { type: "PERCENT" | "FIXED" | "NONE"; value: number }

export function computeDeposit(
  rulesJson: string | null,
  isResidential: boolean,
  totalIncVat: number
): number {
  if (!rulesJson || totalIncVat <= 0) return 0
  try {
    const rules = JSON.parse(rulesJson)
    const rule: DepositRule | undefined = isResidential ? rules.residential : rules.commercial
    if (!rule || rule.type === "NONE" || !rule.value) return 0
    const amount =
      rule.type === "PERCENT" ? (totalIncVat * rule.value) / 100 : Math.min(rule.value, totalIncVat)
    return Math.round(amount * 100) / 100
  } catch {
    return 0
  }
}
