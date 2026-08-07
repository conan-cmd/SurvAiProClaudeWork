import { NextRequest, NextResponse } from "next/server"
import { randomBytes } from "crypto"
import { z } from "zod"
import { db } from "@/lib/db"
import { getCurrentUser } from "@/lib/session"
import { canSend, sendEmail } from "@/lib/email"
import { publicBaseUrl } from "@/lib/public-url"

const schema = z.object({
  // One or more recipient emails, separated by commas, semicolons or spaces.
  to: z.string().min(1, "Enter at least one recipient email"),
  message: z.string().max(2000).optional(),
})
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
function parseRecipients(raw: string): string[] {
  return Array.from(new Set(raw.split(/[,;\s]+/).map((s) => s.trim()).filter(Boolean)))
}
const esc = (s: string) => String(s || "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")

// Emails the client a link to the read-only digital RAMS for the job (mirrors the
// proposal send). Operatives are sent the full RAMS separately via send-operatives.
export async function POST(
  request: NextRequest,
  { params }: { params: { ramsId: string } }
) {
  const user = await getCurrentUser()
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  if (!(await canSend(user.id))) {
    return NextResponse.json(
      { error: "Email isn't set up yet — connect your email in Settings to send." },
      { status: 503 }
    )
  }

  const rams = await db.rams.findFirst({
    where: { id: params.ramsId, organizationId: user.organizationId },
    include: {
      survey: { select: { title: true, clientName: true } },
      organization: { select: { name: true, phone: true, email: true } },
    },
  })
  if (!rams) return NextResponse.json({ error: "Not found" }, { status: 404 })

  const parsed = schema.safeParse(await request.json())
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.errors[0].message }, { status: 400 })
  }
  const recipients = parseRecipients(parsed.data.to)
  if (!recipients.length) {
    return NextResponse.json({ error: "Enter at least one recipient email" }, { status: 400 })
  }
  const invalid = recipients.filter((e) => !EMAIL_RE.test(e))
  if (invalid.length) {
    return NextResponse.json({ error: `Not a valid email: ${invalid.join(", ")}` }, { status: 400 })
  }
  if (recipients.length > 20) {
    return NextResponse.json({ error: "Too many recipients (max 20)" }, { status: 400 })
  }

  // Ensure a public link exists — clients open a clean read-only view (?client=1).
  let token = rams.publicToken
  if (!token) {
    token = randomBytes(12).toString("base64url")
    await db.rams.update({ where: { id: rams.id }, data: { publicToken: token } })
  }
  const url = `${publicBaseUrl(request.nextUrl.origin)}/r/${token}?client=1`

  const org = rams.organization
  const safeMsg = parsed.data.message
    ? esc(parsed.data.message).replace(/\n/g, "<br/>")
    : `Please find the Risk Assessment &amp; Method Statement for <strong>${esc(rams.survey.title)}</strong> below.`
  const html = `
    <div style="font-family:-apple-system,'Segoe UI',Roboto,Arial,sans-serif;font-size:15px;line-height:1.6;color:#111827;max-width:520px">
      <p>Dear ${esc(rams.survey.clientName)},</p>
      <p>${safeMsg}</p>
      <p style="margin:20px 0"><a href="${url}" style="color:#2563EB;font-weight:600">View the RAMS &rarr;</a></p>
      <p>Any questions at all, just reply to this email.</p>
      <p>Kind regards,<br/>${esc(user.name || org.name)}${org.phone ? `<br/>${esc(org.phone)}` : ""}</p>
    </div>`
  const text = [
    `Dear ${rams.survey.clientName},`,
    "",
    parsed.data.message || `Please find the Risk Assessment & Method Statement for ${rams.survey.title} below.`,
    "",
    `View the RAMS: ${url}`,
    "",
    "Any questions at all, just reply to this email.",
    "",
    "Kind regards,",
    `${user.name || org.name}${org.phone ? `\n${org.phone}` : ""}`,
  ].join("\n")

  try {
    await sendEmail({
      to: recipients,
      replyTo: org.email || user.email,
      subject: `RAMS for ${rams.survey.title}`,
      html,
      text,
      fromUserId: user.id,
    })
    return NextResponse.json({ success: true, url })
  } catch (error) {
    console.error("Send RAMS error:", error)
    const msg =
      error instanceof Error && error.message
        ? `Couldn't send: ${error.message}`
        : "Failed to send the email. Please try again."
    return NextResponse.json({ error: msg }, { status: 500 })
  }
}
