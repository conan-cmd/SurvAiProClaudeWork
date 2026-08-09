import { NextRequest, NextResponse } from "next/server"
import { db } from "@/lib/db"
import { getCurrentUser } from "@/lib/session"
import { encryptSecret } from "@/lib/crypto"
import { exchangeCodeForTokens } from "@/lib/pipedrive"
import { publicBaseUrl } from "@/lib/public-url"

// Pipedrive redirects here after the user authorises. Exchanges the code for
// tokens and stores them (encrypted) on the org.
export async function GET(request: NextRequest) {
  const user = await getCurrentUser()
  if (!user) return NextResponse.redirect(new URL("/auth/login", request.url))

  const settings = new URL("/settings", request.url)
  const code = request.nextUrl.searchParams.get("code")
  const state = request.nextUrl.searchParams.get("state")
  const cookieState = request.cookies.get("pd_oauth_state")?.value

  if (request.nextUrl.searchParams.get("error") || !code || !state || state !== cookieState) {
    settings.searchParams.set("pipedrive", "error")
    const r = NextResponse.redirect(settings)
    r.cookies.delete("pd_oauth_state")
    return r
  }

  try {
    const redirectUri = `${publicBaseUrl(request.nextUrl.origin)}/api/pipedrive/oauth/callback`
    const tokens = await exchangeCodeForTokens(code, redirectUri)

    // Company id (best-effort) so the uninstall webhook can match this org.
    let companyId: string | null = null
    try {
      const me = await fetch(`${tokens.api_domain}/api/v1/users/me`, {
        headers: { Authorization: `Bearer ${tokens.access_token}` },
        signal: AbortSignal.timeout(10000),
      })
      const meJson = (await me.json().catch(() => ({}))) as { data?: { company_id?: number } }
      companyId = meJson?.data?.company_id != null ? String(meJson.data.company_id) : null
    } catch {
      /* non-fatal */
    }

    await db.organization.update({
      where: { id: user.organizationId },
      data: {
        pipedriveAccessToken: encryptSecret(tokens.access_token),
        pipedriveRefreshToken: encryptSecret(tokens.refresh_token),
        pipedriveTokenExpiresAt: new Date(Date.now() + tokens.expires_in * 1000),
        pipedriveApiDomain: tokens.api_domain,
        pipedriveCompanyId: companyId,
        // OAuth is now the source of truth — clear any token-mode creds.
        pipedriveApiToken: null,
        pipedriveCompanyDomain: null,
      },
    })
    settings.searchParams.set("pipedrive", "connected")
  } catch {
    settings.searchParams.set("pipedrive", "error")
  }

  const res = NextResponse.redirect(settings)
  res.cookies.delete("pd_oauth_state")
  return res
}

// Pipedrive sends a DELETE (JSON, Basic-auth with the app's client credentials) to
// the OAuth callback URL when a user uninstalls the app — clear that org's tokens.
export async function DELETE(request: NextRequest) {
  const id = process.env.PIPEDRIVE_CLIENT_ID || ""
  const secret = process.env.PIPEDRIVE_CLIENT_SECRET || ""
  const expected = "Basic " + Buffer.from(`${id}:${secret}`).toString("base64")
  if (!id || request.headers.get("authorization") !== expected) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }
  const body = (await request.json().catch(() => ({}))) as { company_id?: number | string }
  const companyId = body?.company_id != null ? String(body.company_id) : null
  if (companyId) {
    await db.organization.updateMany({
      where: { pipedriveCompanyId: companyId },
      data: {
        pipedriveAccessToken: null,
        pipedriveRefreshToken: null,
        pipedriveTokenExpiresAt: null,
        pipedriveApiDomain: null,
        pipedriveCompanyId: null,
      },
    })
  }
  return NextResponse.json({ success: true })
}
