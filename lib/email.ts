import "server-only"
import { db } from "./db"

// Minimal Resend REST client (no SDK dependency), matching lib/stripe.ts style.
const RESEND_API = "https://api.resend.com/emails"

export function emailEnabled(): boolean {
  return Boolean(process.env.RESEND_API_KEY)
}

// The verified sender address. In production we deliberately never fall back to
// Resend's shared sandbox (onboarding@resend.dev): it only delivers to your own
// Resend account and gets spam-filtered everywhere else. Set EMAIL_FROM to an
// address on a domain you've verified in Resend, e.g.
//   EMAIL_FROM=LBC Clean <proposals@lbcclean.co.uk>
function fromAddress(): string {
  const from = process.env.EMAIL_FROM?.trim()
  if (from) return from
  if (process.env.NODE_ENV === "production") {
    throw new Error(
      "EMAIL_FROM is not set. Verify a domain in Resend and set EMAIL_FROM to a sender on that domain."
    )
  }
  // Dev only: the sandbox address delivers to your own Resend account for testing.
  return "SurvAIPro <onboarding@resend.dev>"
}

// Sends a transactional email via Resend. Throws on any failure so callers can
// decide whether to surface the error (proposal send) or swallow it (invites,
// which also hand back a shareable link).
export async function sendEmail(params: {
  to: string | string[]
  subject: string
  html: string
  replyTo?: string | null
  // Plain-text alternative — improves deliverability and inbox placement.
  text?: string
  // When set, and that user has connected their Gmail, the email is sent from
  // their own address via the Gmail API instead of the shared Resend sender.
  fromUserId?: string
}): Promise<void> {
  const recipients = Array.isArray(params.to) ? params.to : [params.to]

  if (params.fromUserId) {
    const sender = await db.user.findUnique({
      where: { id: params.fromUserId },
      select: {
        name: true,
        gmailAddress: true,
        gmailRefreshToken: true,
        organization: { select: { name: true } },
      },
    })
    if (sender?.gmailAddress && sender.gmailRefreshToken) {
      const { decryptSecret } = await import("./crypto")
      const { sendViaGmail } = await import("./gmail")
      const refreshToken = decryptSecret(sender.gmailRefreshToken)
      const fromName = sender.organization?.name || sender.name || "Proposals"
      for (const recipient of recipients) {
        await sendViaGmail({
          refreshToken,
          fromName,
          fromEmail: sender.gmailAddress,
          to: recipient,
          subject: params.subject,
          html: params.html,
          replyTo: params.replyTo,
        })
      }
      return
    }
  }

  // Fall back to the shared Resend sender.
  if (!process.env.RESEND_API_KEY) {
    throw new Error(
      "Email isn't set up yet — connect your email in Settings, or add a RESEND_API_KEY."
    )
  }

  const res = await fetch(RESEND_API, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${process.env.RESEND_API_KEY}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      from: fromAddress(),
      to: recipients,
      ...(params.replyTo ? { reply_to: params.replyTo } : {}),
      subject: params.subject,
      html: params.html,
      ...(params.text ? { text: params.text } : {}),
    }),
    signal: AbortSignal.timeout(15000),
  })

  if (!res.ok) {
    const err = await res.json().catch(() => ({} as { message?: string }))
    throw new Error(err.message || `Email service returned ${res.status}`)
  }
}

// True when either the shared Resend sender or a per-user Gmail could be used.
export async function canSend(userId: string): Promise<boolean> {
  if (process.env.RESEND_API_KEY) return true
  const u = await db.user.findUnique({ where: { id: userId }, select: { gmailRefreshToken: true } })
  return Boolean(u?.gmailRefreshToken)
}
