import { NextRequest, NextResponse } from "next/server"
import { db } from "@/lib/db"
import { getCurrentUser } from "@/lib/session"
import { stripeEnabled, createConnectedAccount, createAccountLink, retrieveAccount } from "@/lib/stripe"
import { publicBaseUrl } from "@/lib/public-url"

// POST: start (or resume) Stripe Connect onboarding for the firm. Returns a URL
// to send the user to. GET: current connection status (also syncs charges_enabled).
export async function POST(request: NextRequest) {
  const user = await getCurrentUser()
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  if (!stripeEnabled()) {
    return NextResponse.json({ error: "Payments aren't configured yet." }, { status: 503 })
  }

  const org = await db.organization.findUnique({
    where: { id: user.organizationId },
    select: { id: true, email: true, stripeAccountId: true },
  })
  if (!org) return NextResponse.json({ error: "Not found" }, { status: 404 })

  try {
    let accountId = org.stripeAccountId
    if (!accountId) {
      const account = await createConnectedAccount(org.email || user.email)
      accountId = account.id
      await db.organization.update({ where: { id: org.id }, data: { stripeAccountId: accountId } })
    }

    const origin = publicBaseUrl(request.nextUrl.origin)
    const link = await createAccountLink(
      accountId,
      `${origin}/settings?stripe=refresh`,
      `${origin}/settings?stripe=return`
    )
    return NextResponse.json({ url: link.url })
  } catch (error) {
    console.error("Stripe connect error:", error)
    const msg = error instanceof Error ? error.message : "Couldn't start Stripe setup."
    return NextResponse.json({ error: msg }, { status: 500 })
  }
}

export async function GET() {
  const user = await getCurrentUser()
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  const org = await db.organization.findUnique({
    where: { id: user.organizationId },
    select: { id: true, stripeAccountId: true, stripeChargesEnabled: true },
  })
  if (!org) return NextResponse.json({ error: "Not found" }, { status: 404 })
  if (!stripeEnabled() || !org.stripeAccountId) {
    return NextResponse.json({ connected: false, chargesEnabled: false })
  }

  try {
    const acct = await retrieveAccount(org.stripeAccountId)
    if (acct.charges_enabled !== org.stripeChargesEnabled) {
      await db.organization.update({
        where: { id: org.id },
        data: { stripeChargesEnabled: acct.charges_enabled },
      })
    }
    return NextResponse.json({
      connected: true,
      chargesEnabled: acct.charges_enabled,
      detailsSubmitted: acct.details_submitted,
      payoutsEnabled: acct.payouts_enabled,
    })
  } catch (error) {
    console.error("Stripe status error:", error)
    return NextResponse.json({ connected: true, chargesEnabled: org.stripeChargesEnabled })
  }
}
