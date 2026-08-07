import { NextRequest, NextResponse } from "next/server"
import { db } from "@/lib/db"
import { verifyCoinbaseWebhook } from "@/lib/coinbase"

const YEAR_MS = 365 * 24 * 60 * 60 * 1000

// Coinbase Commerce webhook. On a confirmed payment, grants the org 12 months of
// access (extending any existing window). Deduped by charge id so webhook retries
// — and the separate confirmed/resolved events for one charge — never double-count.
export async function POST(request: NextRequest) {
  const raw = await request.text()
  const sig = request.headers.get("x-cc-webhook-signature")
  const event = await verifyCoinbaseWebhook(raw, sig)
  if (!event) return NextResponse.json({ error: "Invalid signature" }, { status: 400 })

  const ev = (event as { event?: { type?: string; data?: { id?: string; metadata?: Record<string, string> } } }).event
  const type = ev?.type
  if (type === "charge:confirmed" || type === "charge:resolved") {
    const chargeId = ev?.data?.id
    const meta = ev?.data?.metadata || {}
    const orgId = meta.organizationId
    if (orgId && chargeId) {
      const org = await db.organization.findUnique({
        where: { id: orgId },
        select: { cryptoAccessUntil: true, cryptoLastChargeId: true },
      })
      // Already applied this charge (retry or confirmed+resolved pair) → ignore.
      if (org && org.cryptoLastChargeId !== chargeId) {
        const now = Date.now()
        const base = org.cryptoAccessUntil && org.cryptoAccessUntil.getTime() > now
          ? org.cryptoAccessUntil.getTime()
          : now
        await db.organization.update({
          where: { id: orgId },
          data: {
            cryptoAccessUntil: new Date(base + YEAR_MS),
            cryptoLastChargeId: chargeId,
            subscriptionPlan: "annual_btc",
            ...(meta.founding === "true" ? { isFoundingMember: true } : {}),
          },
        })
      }
    }
  }

  // Always 200 so Coinbase doesn't keep retrying unrecognised events.
  return NextResponse.json({ received: true })
}
