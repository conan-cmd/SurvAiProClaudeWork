import { NextRequest, NextResponse } from "next/server"
import { db } from "@/lib/db"
import { getCurrentUser } from "@/lib/session"
import { exchangeStripeOAuthCode, retrieveAccount } from "@/lib/stripe"

// Stripe redirects here after the firm signs in and approves: swap the code for
// their account id and make it the org's deposit account. This REPLACES any
// Express account created earlier — that account keeps its balance and still
// pays out as normal, it just stops receiving new deposits.
export async function GET(request: NextRequest) {
  const user = await getCurrentUser()
  if (!user) return NextResponse.redirect(new URL("/auth/login", request.url))

  const settings = new URL("/settings", request.url)
  const code = request.nextUrl.searchParams.get("code")
  const state = request.nextUrl.searchParams.get("state")
  const cookieState = request.cookies.get("stripe_oauth_state")?.value
  const oauthError = request.nextUrl.searchParams.get("error")

  const fail = (why: string) => {
    settings.searchParams.set("stripe", "error")
    settings.searchParams.set("why", why.slice(0, 120))
    const r = NextResponse.redirect(settings)
    r.cookies.delete("stripe_oauth_state")
    return r
  }

  if (user.role !== "OWNER" && user.role !== "ADMIN") return fail("only an owner or admin can link Stripe")
  if (oauthError) {
    return fail(oauthError === "access_denied" ? "linking was cancelled" : request.nextUrl.searchParams.get("error_description") || oauthError)
  }
  if (!code || !state || state !== cookieState) return fail(!code ? "no code returned" : "state mismatch")

  try {
    const { stripe_user_id } = await exchangeStripeOAuthCode(code)
    const acct = await retrieveAccount(stripe_user_id)
    await db.organization.update({
      where: { id: user.organizationId },
      data: { stripeAccountId: acct.id, stripeChargesEnabled: acct.charges_enabled },
    })
    settings.searchParams.set("stripe", acct.charges_enabled ? "linked" : "linked-pending")
  } catch (err) {
    console.error("Stripe OAuth link failed:", err)
    return fail(err instanceof Error ? err.message : "unexpected error")
  }

  const res = NextResponse.redirect(settings)
  res.cookies.delete("stripe_oauth_state")
  return res
}
