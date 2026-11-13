import "server-only"

// Tier 2 email, Microsoft edition: send proposals through the user's own
// Microsoft 365 / Outlook mailbox via the Graph API, mirroring lib/gmail.ts.
// Dormant until MICROSOFT_CLIENT_ID / MICROSOFT_CLIENT_SECRET are set — no
// Microsoft endpoint is ever called without them.

const SCOPES = [
  "openid",
  "email",
  "offline_access",
  "https://graph.microsoft.com/User.Read",
  "https://graph.microsoft.com/Mail.Send",
].join(" ")

const AUTH_BASE = "https://login.microsoftonline.com/common/oauth2/v2.0"
const GRAPH = "https://graph.microsoft.com/v1.0"

function redirectUri(): string {
  return `${process.env.NEXTAUTH_URL || ""}/api/email/microsoft/callback`
}

export function microsoftMailEnabled(): boolean {
  return Boolean(process.env.MICROSOFT_CLIENT_ID && process.env.MICROSOFT_CLIENT_SECRET)
}

export function microsoftConnectUrl(state: string): string {
  const params = new URLSearchParams({
    client_id: process.env.MICROSOFT_CLIENT_ID || "",
    redirect_uri: redirectUri(),
    response_type: "code",
    response_mode: "query",
    prompt: "select_account",
    scope: SCOPES,
    state,
  })
  return `${AUTH_BASE}/authorize?${params.toString()}`
}

export async function exchangeCodeForTokens(
  code: string
): Promise<{ refreshToken: string; email: string }> {
  const res = await fetch(`${AUTH_BASE}/token`, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      code,
      client_id: process.env.MICROSOFT_CLIENT_ID || "",
      client_secret: process.env.MICROSOFT_CLIENT_SECRET || "",
      redirect_uri: redirectUri(),
      grant_type: "authorization_code",
      scope: SCOPES,
    }),
  })
  const data = await res.json()
  if (!res.ok) throw new Error(data.error_description || data.error || "Token exchange failed")
  if (!data.refresh_token) {
    throw new Error("Microsoft didn't return a refresh token — please try connecting again")
  }
  const who = await fetch(`${GRAPH}/me`, {
    headers: { Authorization: `Bearer ${data.access_token}` },
  })
  const info = await who.json()
  const email = info.mail || info.userPrincipalName
  if (!email) throw new Error("Couldn't read the connected email address")
  return { refreshToken: data.refresh_token as string, email: email as string }
}

async function accessTokenFromRefresh(refreshToken: string): Promise<string> {
  const res = await fetch(`${AUTH_BASE}/token`, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      refresh_token: refreshToken,
      client_id: process.env.MICROSOFT_CLIENT_ID || "",
      client_secret: process.env.MICROSOFT_CLIENT_SECRET || "",
      grant_type: "refresh_token",
      scope: SCOPES,
    }),
  })
  const data = await res.json()
  if (!res.ok) throw new Error(data.error_description || data.error || "Couldn't refresh Microsoft token")
  return data.access_token as string
}

export async function sendViaOutlook(params: {
  refreshToken: string
  to: string
  subject: string
  html: string
  replyTo?: string | null
}): Promise<void> {
  const accessToken = await accessTokenFromRefresh(params.refreshToken)
  const res = await fetch(`${GRAPH}/me/sendMail`, {
    method: "POST",
    headers: { Authorization: `Bearer ${accessToken}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      message: {
        subject: params.subject,
        body: { contentType: "HTML", content: params.html },
        toRecipients: [{ emailAddress: { address: params.to } }],
        ...(params.replyTo ? { replyTo: [{ emailAddress: { address: params.replyTo } }] } : {}),
      },
      saveToSentItems: true,
    }),
    signal: AbortSignal.timeout(15000),
  })
  // Graph returns 202 with an empty body on success.
  if (!res.ok) {
    const err = await res.json().catch(() => ({} as { error?: { message?: string } }))
    throw new Error(err.error?.message || `Microsoft send failed (${res.status})`)
  }
}
