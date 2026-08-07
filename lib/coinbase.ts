import "server-only"

// Minimal Coinbase Commerce REST client (no SDK). Used for annual, pay-upfront
// Bitcoin subscription payments — crypto can't auto-renew, so the firm pays for a
// 12-month window and is reminded to renew. Card subscriptions stay on Stripe.
const API = "https://api.commerce.coinbase.com"

export function coinbaseEnabled(): boolean {
  return Boolean(process.env.COINBASE_COMMERCE_API_KEY)
}

// Creates a fixed-price charge (in GBP; Coinbase shows the BTC equivalent at
// checkout) and returns its hosted payment page URL.
export async function createCharge(params: {
  name: string
  description: string
  amountGBP: number
  organizationId: string
  founding: boolean
  redirectUrl: string
  cancelUrl: string
}): Promise<{ hostedUrl: string; id: string }> {
  const res = await fetch(`${API}/charges`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-CC-Api-Key": process.env.COINBASE_COMMERCE_API_KEY || "",
      "X-CC-Version": "2018-03-22",
    },
    body: JSON.stringify({
      name: params.name,
      description: params.description,
      pricing_type: "fixed_price",
      local_price: { amount: params.amountGBP.toFixed(2), currency: "GBP" },
      metadata: {
        organizationId: params.organizationId,
        plan: "annual_btc",
        founding: params.founding ? "true" : "false",
      },
      redirect_url: params.redirectUrl,
      cancel_url: params.cancelUrl,
    }),
    signal: AbortSignal.timeout(15000),
  })
  const data = await res.json()
  if (!res.ok) throw new Error(data?.error?.message || `Coinbase Commerce ${res.status}`)
  return { hostedUrl: data.data.hosted_url, id: data.data.id }
}

// Verifies a Coinbase Commerce webhook. The X-CC-Webhook-Signature header is a
// hex HMAC-SHA256 of the raw request body using the shared webhook secret.
export async function verifyCoinbaseWebhook(
  rawBody: string,
  signature: string | null
): Promise<Record<string, unknown> | null> {
  const secret = process.env.COINBASE_COMMERCE_WEBHOOK_SECRET
  if (!secret || !signature) return null
  const { createHmac, timingSafeEqual } = await import("crypto")
  const expected = createHmac("sha256", secret).update(rawBody).digest("hex")
  try {
    if (!timingSafeEqual(Buffer.from(expected), Buffer.from(signature))) return null
  } catch {
    return null
  }
  try {
    return JSON.parse(rawBody)
  } catch {
    return null
  }
}
