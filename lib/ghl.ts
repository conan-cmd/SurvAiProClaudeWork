import "server-only"

// Fires a lifecycle event to a GoHighLevel inbound webhook so GHL can run the
// win-back / dunning / onboarding sequences. No-op unless a webhook URL is set.
// Best-effort — never throws into the caller.
//
// Config: GHL_WEBHOOK_URL = one URL all events POST to (GHL workflows filter on the
// JSON `event` field); or GHL_WEBHOOK_URL_<EVENT> to give a specific event its own
// workflow URL (overrides the shared one for that event).
export function ghlEnabled(): boolean {
  return Boolean(
    process.env.GHL_WEBHOOK_URL ||
      Object.keys(process.env).some((k) => k.startsWith("GHL_WEBHOOK_URL_"))
  )
}

function urlFor(event: string): string | undefined {
  return process.env[`GHL_WEBHOOK_URL_${event.toUpperCase()}`] || process.env.GHL_WEBHOOK_URL
}

export type GhlPayload = {
  // e.g. "trial_started" | "trial_ending" | "subscription_canceled" | "payment_failed"
  //      | "subscription_active" | "activated" | "dormant" | "power_user"
  event: string
  email: string
  name?: string | null
  company?: string | null
  plan?: string | null
  status?: string | null
  billingUrl?: string | null
  // Extras for newer lifecycle events — all optional, so existing callers are unaffected.
  phone?: string | null
  organizationId?: string
  surveysCount?: number
  proposalsCount?: number
  ramsCount?: number
  signedUpAt?: string | null
  [k: string]: unknown
}

// Returns a result so admin tooling can report success; existing callers can keep
// ignoring the return value (they just `await` it).
export async function sendGhlEvent(
  payload: GhlPayload
): Promise<{ ok: boolean; status?: number; error?: string }> {
  const url = urlFor(payload.event)
  if (!url || !payload.email) return { ok: false, error: "GHL not configured, or no email on the payload." }

  const [firstName, ...rest] = String(payload.name || "").trim().split(/\s+/)
  const body = {
    ...payload,
    firstName: firstName || undefined,
    lastName: rest.length ? rest.join(" ") : undefined,
    occurredAt: new Date().toISOString(),
  }
  try {
    const res = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(8000),
    })
    return { ok: res.ok, status: res.status }
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "request failed" }
  }
}
