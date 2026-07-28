import { NextRequest, NextResponse } from "next/server"
import { db } from "@/lib/db"
import { getCurrentUser } from "@/lib/session"
import { stripeEnabled, createBillingPortal } from "@/lib/stripe"
import { publicBaseUrl } from "@/lib/public-url"

// Opens the Stripe customer portal so the firm can manage/cancel/update their plan.
export async function POST(request: NextRequest) {
  const user = await getCurrentUser()
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  if (!stripeEnabled()) return NextResponse.json({ error: "Billing isn't configured yet." }, { status: 503 })

  const org = await db.organization.findUnique({
    where: { id: user.organizationId },
    select: { stripeCustomerId: true },
  })
  if (!org?.stripeCustomerId) {
    return NextResponse.json({ error: "No billing account yet — start a subscription first." }, { status: 400 })
  }

  const origin = publicBaseUrl(request.nextUrl.origin)
  try {
    const portal = await createBillingPortal(org.stripeCustomerId, `${origin}/settings`)
    return NextResponse.json({ url: portal.url })
  } catch (error) {
    console.error("Billing portal error:", error)
    const msg = error instanceof Error ? error.message : "Couldn't open billing."
    return NextResponse.json({ error: msg }, { status: 500 })
  }
}
