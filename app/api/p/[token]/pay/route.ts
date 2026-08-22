import { NextRequest, NextResponse } from "next/server"
import { db } from "@/lib/db"
import { stripeEnabled, createDepositCheckout, computeDeposit } from "@/lib/stripe"
import { calculateProposalTotals } from "@/lib/utils"
import { publicBaseUrl } from "@/lib/public-url"

// Public: client pays their deposit after signing, via the secure share link.
export async function POST(
  request: NextRequest,
  { params }: { params: { token: string } }
) {
  if (!stripeEnabled()) {
    return NextResponse.json({ error: "Payments are not enabled" }, { status: 503 })
  }

  const link = await db.shareLink.findUnique({
    where: { token: params.token },
    include: {
      proposal: {
        include: {
          pricingLineItems: true,
          survey: { select: { title: true, isResidential: true } },
          organization: { select: { name: true, depositRules: true, stripeAccountId: true, stripeChargesEnabled: true } },
        },
      },
    },
  })
  if (!link || link.revoked) { // expiry off (2026-08-22); revoke still applies
    return NextResponse.json({ error: "This link is no longer valid" }, { status: 404 })
  }

  const p = link.proposal
  if (!p.signedAt) {
    return NextResponse.json({ error: "Please sign the proposal first" }, { status: 400 })
  }
  if (p.depositPaidAt) {
    return NextResponse.json({ error: "Deposit already paid" }, { status: 409 })
  }

  const totals = calculateProposalTotals(p.pricingLineItems)
  const deposit = computeDeposit(
    p.organization.depositRules,
    p.survey.isResidential,
    totals.total
  )
  if (deposit <= 0) {
    return NextResponse.json({ error: "No deposit is due on this proposal" }, { status: 400 })
  }

  const origin = publicBaseUrl(request.nextUrl.origin)
  try {
    // Route the deposit to the firm's own Stripe account when they've connected one.
    const connectedAccountId =
      p.organization.stripeChargesEnabled && p.organization.stripeAccountId
        ? p.organization.stripeAccountId
        : null
    const session = await createDepositCheckout({
      amountPence: Math.round(deposit * 100),
      proposalTitle: p.survey.title,
      companyName: p.organization.name,
      proposalId: p.id,
      successUrl: `${origin}/p/${params.token}?session_id={CHECKOUT_SESSION_ID}`,
      cancelUrl: `${origin}/p/${params.token}`,
      customerEmail: p.clientEmail,
      connectedAccountId,
    })

    await db.proposal.update({
      where: { id: p.id },
      data: { depositAmount: deposit, stripeSessionId: session.id },
    })

    return NextResponse.json({ url: session.url })
  } catch (error) {
    console.error("Deposit checkout error:", error)
    return NextResponse.json(
      { error: "Couldn't start the payment. Please try again." },
      { status: 500 }
    )
  }
}
