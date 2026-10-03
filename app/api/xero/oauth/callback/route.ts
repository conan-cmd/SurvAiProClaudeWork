import { NextRequest, NextResponse } from "next/server"
import { db } from "@/lib/db"
import { getCurrentUser } from "@/lib/session"
import { encryptSecret } from "@/lib/crypto"
import { exchangeCodeForTokens, firstTenant } from "@/lib/xero"
import { publicBaseUrl } from "@/lib/public-url"

// Xero redirects here after consent: exchange the code, resolve the tenant
// (the Xero organisation invoices go into) and store everything encrypted.
export async function GET(request: NextRequest) {
  const user = await getCurrentUser()
  if (!user) return NextResponse.redirect(new URL("/auth/login", request.url))

  const settings = new URL("/settings", request.url)
  const code = request.nextUrl.searchParams.get("code")
  const state = request.nextUrl.searchParams.get("state")
  const cookieState = request.cookies.get("xero_oauth_state")?.value

  if (request.nextUrl.searchParams.get("error") || !code || !state || state !== cookieState) {
    settings.searchParams.set("xero", "error")
    const r = NextResponse.redirect(settings)
    r.cookies.delete("xero_oauth_state")
    return r
  }

  try {
    const redirectUri = `${publicBaseUrl(request.nextUrl.origin)}/api/xero/oauth/callback`
    const tokens = await exchangeCodeForTokens(code, redirectUri)
    const tenant = await firstTenant(tokens.access_token)
    if (!tenant) throw new Error("No Xero organisation authorised")

    await db.organization.update({
      where: { id: user.organizationId },
      data: {
        xeroAccessToken: encryptSecret(tokens.access_token),
        xeroRefreshToken: encryptSecret(tokens.refresh_token),
        xeroTokenExpiresAt: new Date(Date.now() + tokens.expires_in * 1000),
        xeroTenantId: tenant.tenantId,
        xeroTenantName: tenant.tenantName,
      },
    })
    settings.searchParams.set("xero", "connected")
  } catch {
    settings.searchParams.set("xero", "error")
  }

  const res = NextResponse.redirect(settings)
  res.cookies.delete("xero_oauth_state")
  return res
}
