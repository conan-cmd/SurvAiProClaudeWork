import { NextRequest, NextResponse } from "next/server"
import { db } from "@/lib/db"
import { getCurrentUser } from "@/lib/session"
import { exchangeCodeForTokens } from "@/lib/microsoft-mail"
import { encryptSecret } from "@/lib/crypto"

// Completes the Microsoft connect flow: verifies state, swaps the code for a
// refresh token, and stores it (encrypted) against the current user.
export async function GET(request: NextRequest) {
  const base = process.env.NEXTAUTH_URL || request.nextUrl.origin
  const user = await getCurrentUser()
  if (!user) return NextResponse.redirect(new URL("/auth/login", base))

  const sp = request.nextUrl.searchParams
  const code = sp.get("code")
  const state = sp.get("state")
  const cookieState = request.cookies.get("ms_oauth_state")?.value

  if (sp.get("error") || !code || !state || !cookieState || state !== cookieState) {
    return NextResponse.redirect(new URL("/settings?email=error", base))
  }

  try {
    const { refreshToken, email } = await exchangeCodeForTokens(code)
    await db.user.update({
      where: { id: user.id },
      data: { microsoftEmail: email, microsoftRefreshToken: encryptSecret(refreshToken) },
    })
  } catch (err) {
    console.error("Microsoft connect failed:", err)
    return NextResponse.redirect(new URL("/settings?email=error", base))
  }

  const res = NextResponse.redirect(new URL("/settings?email=connected", base))
  res.cookies.delete("ms_oauth_state")
  return res
}
