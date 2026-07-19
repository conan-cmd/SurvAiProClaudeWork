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

async function stripeFetch(path: string, body?: Record<string, string>) {
  const res = await fetch(`${STRIPE_API}${path}`, {
    method: body ? "POST" : "GET",
    headers: {
      Authorization: `Bearer ${process.env.STRIPE_SECRET_KEY}`,
      ...(body && { "Content-Type": "application/x-www-form-urlencoded" }),
    },
    body: body ? form(body) : undefined,
    signal: AbortSignal.timeout(15000),
  })
  const data = await res.json()
  if (!res.ok) throw new Error(data.error?.message || `Stripe ${res.status}`)
  return data
}

export async function createDepositCheckout(params: {
  amountPence: number
  proposalTitle: string
  companyName: string
  proposalId: string
  successUrl: string
  cancelUrl: string
  customerEmail?: string | null
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
  return stripeFetch("/checkout/sessions", body)
}

export async function retrieveCheckoutSession(sessionId: string) {
  return stripeFetch(`/checkout/sessions/${encodeURIComponent(sessionId)}`)
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
