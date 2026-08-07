import { NextRequest, NextResponse } from "next/server"
import { db } from "@/lib/db"
import { getCurrentUser } from "@/lib/session"
import { PRICING, FOUNDING_LIMIT } from "@/lib/stripe"
import { coinbaseEnabled, createCharge } from "@/lib/coinbase"
import { publicBaseUrl } from "@/lib/public-url"

// Starts a Bitcoin payment (Coinbase Commerce) for 12 months' access. Bitcoin
// can't auto-renew, so this is annual, pay-upfront; the webhook grants the year.
export async function POST(request: NextRequest) {
  const user = await getCurrentUser()
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  if (!coinbaseEnabled()) {
    return NextResponse.json({ error: "Bitcoin payments aren't set up yet." }, { status: 503 })
  }

  const org = await db.organization.findUnique({
    where: { id: user.organizationId },
    select: { id: true },
  })
  if (!org) return NextResponse.json({ error: "Not found" }, { status: 404 })

  // Founding pricing while fewer than 100 firms have claimed it (mirrors Stripe).
  const foundingUsed = await db.organization.count({ where: { isFoundingMember: true } })
  const founding = foundingUsed < FOUNDING_LIMIT
  const tier = founding ? PRICING.founding : PRICING.standard
  const amountGBP = tier.annual.amountPence / 100

  const origin = publicBaseUrl(request.nextUrl.origin)
  try {
    const { hostedUrl } = await createCharge({
      name: `SurvAIPro — ${founding ? "Founding " : ""}Annual (Bitcoin)`,
      description: "12 months' access to SurvAIPro, paid in Bitcoin.",
      amountGBP,
      organizationId: org.id,
      founding,
      redirectUrl: `${origin}/dashboard`,
      cancelUrl: `${origin}/subscribe`,
    })
    return NextResponse.json({ url: hostedUrl })
  } catch (error) {
    console.error("Crypto charge error:", error)
    const msg = error instanceof Error ? error.message : "Couldn't start the Bitcoin payment."
    return NextResponse.json({ error: msg }, { status: 500 })
  }
}
