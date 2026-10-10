import { NextRequest, NextResponse } from "next/server"
import { randomBytes } from "crypto"
import { getCurrentUser } from "@/lib/session"
import { stripeOAuthAvailable, stripeOAuthUrl } from "@/lib/stripe"
import { publicBaseUrl } from "@/lib/public-url"

// Kicks off linking a firm's EXISTING Stripe account (Connect OAuth, Standard):
// CSRF state cookie + redirect to Stripe's sign-in/consent page.
export async function GET(request: NextRequest) {
  const user = await getCurrentUser()
  if (!user) return NextResponse.redirect(new URL("/auth/login", request.url))
  if (user.role !== "OWNER" && user.role !== "ADMIN") {
    return NextResponse.redirect(new URL("/settings?stripe=forbidden", request.url))
  }
  if (!stripeOAuthAvailable()) {
    return NextResponse.redirect(new URL("/settings?stripe=unavailable", request.url))
  }

  const state = randomBytes(16).toString("base64url")
  const redirectUri = `${publicBaseUrl(request.nextUrl.origin)}/api/stripe/oauth/callback`
  const res = NextResponse.redirect(stripeOAuthUrl(state, redirectUri, user.organization.email || user.email))
  res.cookies.set("stripe_oauth_state", state, {
    httpOnly: true,
    secure: true,
    sameSite: "lax",
    maxAge: 600,
    path: "/",
  })
  return res
}
