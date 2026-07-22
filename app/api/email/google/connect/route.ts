import { NextRequest, NextResponse } from "next/server"
import { randomBytes } from "crypto"
import { getCurrentUser } from "@/lib/session"
import { gmailEnabled, gmailConnectUrl } from "@/lib/gmail"

// Starts the "connect your email" OAuth flow: redirects to Google to grant the
// gmail.send scope, with a CSRF state cookie verified on the callback.
export async function GET(request: NextRequest) {
  const base = process.env.NEXTAUTH_URL || request.nextUrl.origin
  const user = await getCurrentUser()
  if (!user) return NextResponse.redirect(new URL("/auth/login", base))
  if (!gmailEnabled()) {
    return NextResponse.redirect(new URL("/settings?email=unavailable", base))
  }

  const state = randomBytes(16).toString("hex")
  const res = NextResponse.redirect(gmailConnectUrl(state))
  res.cookies.set("gmail_oauth_state", state, {
    httpOnly: true,
    secure: true,
    sameSite: "lax",
    maxAge: 600,
    path: "/",
  })
  return res
}
