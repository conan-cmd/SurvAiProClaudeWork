import { NextRequest, NextResponse } from "next/server"
import { randomBytes } from "crypto"
import { getCurrentUser } from "@/lib/session"
import { oauthAvailable, authorizeUrl } from "@/lib/pipedrive"
import { publicBaseUrl } from "@/lib/public-url"

// Kicks off the Pipedrive OAuth install: sets a CSRF state cookie and redirects to
// Pipedrive's consent screen.
export async function GET(request: NextRequest) {
  const user = await getCurrentUser()
  if (!user) return NextResponse.redirect(new URL("/auth/login", request.url))
  if (user.role !== "OWNER" && user.role !== "ADMIN") {
    return NextResponse.redirect(new URL("/settings?pipedrive=forbidden", request.url))
  }
  if (!oauthAvailable()) {
    return NextResponse.redirect(new URL("/settings?pipedrive=unavailable", request.url))
  }

  const state = randomBytes(16).toString("base64url")
  const redirectUri = `${publicBaseUrl(request.nextUrl.origin)}/api/pipedrive/oauth/callback`
  const res = NextResponse.redirect(authorizeUrl(state, redirectUri))
  res.cookies.set("pd_oauth_state", state, {
    httpOnly: true,
    secure: true,
    sameSite: "lax",
    maxAge: 600,
    path: "/",
  })
  return res
}
