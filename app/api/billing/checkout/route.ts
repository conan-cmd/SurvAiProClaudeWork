import { NextRequest, NextResponse } from "next/server"
import { z } from "zod"
import { db } from "@/lib/db"
import { getCurrentUser } from "@/lib/session"
import { stripeEnabled, createSubscriptionCheckout, PRICING, FOUNDING_LIMIT } from "@/lib/stripe"
import { publicBaseUrl } from "@/lib/public-url"

const schema = z.object({ plan: z.enum(["monthly", "annual"]) })

// Starts a subscription checkout (14-day trial, card required) for the firm.
export async function POST(request: NextRequest) {
  const user = await getCurrentUser()
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  if (!stripeEnabled()) return NextResponse.json({ error: "Billing isn't configured yet." }, { status: 503 })

  const parsed = schema.safeParse(await request.json())
  if (!parsed.success) return NextResponse.json({ error: "Choose a plan" }, { status: 400 })

  const org = await db.organization.findUnique({
    where: { id: user.organizationId },
    select: { id: true, email: true, stripeCustomerId: true },
  })
  if (!org) return NextResponse.json({ error: "Not found" }, { status: 404 })

  // Founding pricing while fewer than 100 firms have claimed it.
  const foundingUsed = await db.organization.count({ where: { isFoundingMember: true } })
  const founding = foundingUsed < FOUNDING_LIMIT
  const tier = founding ? PRICING.founding : PRICING.standard

  const origin = publicBaseUrl(request.nextUrl.origin)
  try {
    const session = await createSubscriptionCheckout({
      plan: parsed.data.plan,
      amountPence: tier[parsed.data.plan].amountPence,
      founding,
      organizationId: org.id,
      customerId: org.stripeCustomerId,
      customerEmail: org.email || user.email,
      successUrl: `${origin}/subscribe?session_id={CHECKOUT_SESSION_ID}`,
      cancelUrl: `${origin}/subscribe`,
    })
    return NextResponse.json({ url: session.url })
  } catch (error) {
    console.error("Subscription checkout error:", error)
    const msg = error instanceof Error ? error.message : "Couldn't start checkout."
    return NextResponse.json({ error: msg }, { status: 500 })
  }
}
