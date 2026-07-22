import "server-only"

// Tier 2 email: send proposals through the user's own Gmail via the Gmail API,
// so mail genuinely comes from their address (great deliverability + branding,
// lands in their Sent). Reuses the same Google OAuth client as login, but this
// is a separate consent flow that additionally requests the gmail.send scope.

const SCOPES = ["openid", "email", "https://www.googleapis.com/auth/gmail.send"].join(" ")

function redirectUri(): string {
  return `${process.env.NEXTAUTH_URL || ""}/api/email/google/callback`
}

export function gmailEnabled(): boolean {
  return Boolean(process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_SECRET)
}

export function gmailConnectUrl(state: string): string {
  const params = new URLSearchParams({
    client_id: process.env.GOOGLE_CLIENT_ID || "",
    redirect_uri: redirectUri(),
    response_type: "code",
    access_type: "offline",
    prompt: "consent", // force a refresh token to be returned
    include_granted_scopes: "true",
    scope: SCOPES,
    state,
  })
  return `https://accounts.google.com/o/oauth2/v2/auth?${params.toString()}`
}

export async function exchangeCodeForTokens(
  code: string
): Promise<{ refreshToken: string; email: string }> {
  const res = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      code,
      client_id: process.env.GOOGLE_CLIENT_ID || "",
      client_secret: process.env.GOOGLE_CLIENT_SECRET || "",
      redirect_uri: redirectUri(),
      grant_type: "authorization_code",
    }),
  })
  const data = await res.json()
  if (!res.ok) throw new Error(data.error_description || data.error || "Token exchange failed")
  if (!data.refresh_token) {
    throw new Error("Google didn't return a refresh token — please try connecting again")
  }
  const who = await fetch("https://www.googleapis.com/oauth2/v2/userinfo", {
    headers: { Authorization: `Bearer ${data.access_token}` },
  })
  const info = await who.json()
  if (!info.email) throw new Error("Couldn't read the connected email address")
  return { refreshToken: data.refresh_token, email: info.email as string }
}

async function accessTokenFromRefresh(refreshToken: string): Promise<string> {
  const res = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      refresh_token: refreshToken,
      client_id: process.env.GOOGLE_CLIENT_ID || "",
      client_secret: process.env.GOOGLE_CLIENT_SECRET || "",
      grant_type: "refresh_token",
    }),
  })
  const data = await res.json()
  if (!res.ok) throw new Error(data.error_description || data.error || "Couldn't refresh Google token")
  return data.access_token as string
}

// RFC 2047 encode a header value only if it contains non-ASCII characters.
function encodeHeader(value: string): string {
  // eslint-disable-next-line no-control-regex
  if (/^[\x00-\x7F]*$/.test(value)) return value
  return `=?UTF-8?B?${Buffer.from(value, "utf8").toString("base64")}?=`
}

function buildMime(params: {
  fromName: string
  fromEmail: string
  to: string
  subject: string
  html: string
  replyTo?: string | null
}): string {
  const headers = [
    `From: ${encodeHeader(params.fromName)} <${params.fromEmail}>`,
    `To: ${params.to}`,
    ...(params.replyTo ? [`Reply-To: ${params.replyTo}`] : []),
    `Subject: ${encodeHeader(params.subject)}`,
    "MIME-Version: 1.0",
    'Content-Type: text/html; charset="UTF-8"',
  ]
  const raw = headers.join("\r\n") + "\r\n\r\n" + params.html
  return Buffer.from(raw, "utf8").toString("base64url")
}

export async function sendViaGmail(params: {
  refreshToken: string
  fromName: string
  fromEmail: string
  to: string
  subject: string
  html: string
  replyTo?: string | null
}): Promise<void> {
  const accessToken = await accessTokenFromRefresh(params.refreshToken)
  const res = await fetch("https://gmail.googleapis.com/gmail/v1/users/me/messages/send", {
    method: "POST",
    headers: { Authorization: `Bearer ${accessToken}`, "Content-Type": "application/json" },
    body: JSON.stringify({ raw: buildMime(params) }),
    signal: AbortSignal.timeout(15000),
  })
  if (!res.ok) {
    const err = await res.json().catch(() => ({} as { error?: { message?: string } }))
    throw new Error(err.error?.message || `Gmail send failed (${res.status})`)
  }
}
