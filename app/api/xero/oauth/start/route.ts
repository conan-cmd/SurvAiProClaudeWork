import { NextRequest, NextResponse } from "next/server"
import { randomBytes } from "crypto"
import { getCurrentUser } from "@/lib/session"
import { xeroAvailable, authorizeUrl } from "@/lib/xero"
import { publicBaseUrl } from "@/lib/public-url"

// Kicks off the Xero OAuth connect: CSRF state cookie + redirect to consent.
export async function GET(request: NextRequest) {
  const user = await getCurrentUser()
  if (!user) return NextResponse.redirect(new URL("/auth/login", request.url))
  if (user.role !== "OWNER" && user.role !== "ADMIN") {
    return NextResponse.redirect(new URL("/settings?xero=forbidden", request.url))
  }
  if (!xeroAvailable()) {
    return NextResponse.redirect(new URL("/settings?xero=unavailable", request.url))
  }

  const state = randomBytes(16).toString("base64url")
  const redirectUri = `${publicBaseUrl(request.nextUrl.origin)}/api/xero/oauth/callback`
  const res = NextResponse.redirect(authorizeUrl(state, redirectUri))
  res.cookies.set("xero_oauth_state", state, {
    httpOnly: true,
    secure: true,
    sameSite: "lax",
    maxAge: 600,
    path: "/",
  })
  return res
}
