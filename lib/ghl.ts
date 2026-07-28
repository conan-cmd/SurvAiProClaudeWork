import "server-only"

// Fires a lifecycle event to a GoHighLevel inbound webhook so GHL can run the
// win-back / dunning / onboarding sequences. No-op unless GHL_WEBHOOK_URL is set.
// Best-effort — never throws into the caller.
export async function sendGhlEvent(payload: {
  event: string // e.g. "trial_started" | "trial_ending" | "subscription_canceled" | "payment_failed" | "subscription_active"
  email: string
  name?: string | null
  company?: string | null
  plan?: string | null
  status?: string | null
  billingUrl?: string | null
}): Promise<void> {
  const url = process.env.GHL_WEBHOOK_URL
  if (!url || !payload.email) return
  try {
    await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
      signal: AbortSignal.timeout(8000),
    })
  } catch {
    // best-effort
  }
}
