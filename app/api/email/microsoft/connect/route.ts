import { NextRequest, NextResponse } from "next/server"
import { randomBytes } from "crypto"
import { getCurrentUser } from "@/lib/session"
import { microsoftMailEnabled, microsoftConnectUrl } from "@/lib/microsoft-mail"

// Starts the "connect your Microsoft email" OAuth flow, mirroring the Google one.
export async function GET(request: NextRequest) {
  const base = process.env.NEXTAUTH_URL || request.nextUrl.origin
  const user = await getCurrentUser()
  if (!user) return NextResponse.redirect(new URL("/auth/login", base))
  if (!microsoftMailEnabled()) {
    return NextResponse.redirect(new URL("/settings?email=unavailable", base))
  }

  const state = randomBytes(16).toString("hex")
  const res = NextResponse.redirect(microsoftConnectUrl(state))
  res.cookies.set("ms_oauth_state", state, {
    httpOnly: true,
    secure: true,
    sameSite: "lax",
    maxAge: 600,
    path: "/",
  })
  return res
}
