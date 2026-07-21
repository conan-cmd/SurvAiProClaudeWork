import { NextRequest, NextResponse } from "next/server"
import { randomBytes } from "crypto"
import { z } from "zod"
import { db } from "@/lib/db"
import { getCurrentUser } from "@/lib/session"
import { emailEnabled, sendEmail } from "@/lib/email"

const sendSchema = z.object({
  to: z.string().email("Enter a valid email address"),
  message: z.string().max(2000).optional(),
})

// Emails the client a secure link to the proposal and marks it Sent.
export async function POST(
  request: NextRequest,
  { params }: { params: { proposalId: string } }
) {
  const user = await getCurrentUser()
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  if (!emailEnabled()) {
    return NextResponse.json(
      { error: "Email isn't set up yet - add a RESEND_API_KEY to enable sending." },
      { status: 503 }
    )
  }

  const proposal = await db.proposal.findFirst({
    where: { id: params.proposalId, organizationId: user.organizationId },
    include: { organization: true, survey: { select: { title: true } } },
  })
  if (!proposal) return NextResponse.json({ error: "Not found" }, { status: 404 })

  const parsed = sendSchema.safeParse(await request.json())
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.errors[0].message }, { status: 400 })
  }
  const { to, message } = parsed.data

  // Fresh secure link for this send
  const token = randomBytes(32).toString("base64url")
  const expiresAt = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000)
  await db.shareLink.create({ data: { proposalId: proposal.id, token, expiresAt } })
  const origin = process.env.NEXTAUTH_URL || request.nextUrl.origin
  const url = `${origin}/p/${token}`

  const org = proposal.organization
  const html = `
    <div style="font-family:Inter,Arial,sans-serif;max-width:560px;margin:0 auto;color:#0F172A">
      <div style="background:#0F172A;padding:24px;border-radius:12px 12px 0 0">
        <span style="color:#fff;font-size:20px;font-weight:bold">${org.name}</span>
      </div>
      <div style="border:1px solid #e2e8f0;border-top:none;padding:28px;border-radius:0 0 12px 12px">
        <p>Dear ${proposal.clientName},</p>
        <p>${message ? message.replace(/</g, "&lt;").replace(/\n/g, "<br/>") : `Please find your proposal for <strong>${proposal.survey.title}</strong> at the link below.`}</p>
        <p style="margin:28px 0">
          <a href="${url}" style="background:${org.brandColor};color:#fff;padding:12px 28px;border-radius:8px;text-decoration:none;font-weight:bold">View Your Proposal</a>
        </p>
        <p>Any questions at all, just reply to this email.</p>
        <p>Kind regards,<br/>${user.name || org.name}${org.phone ? `<br/>${org.phone}` : ""}</p>
      </div>
    </div>`

  try {
    await sendEmail({
      to,
      replyTo: org.email || user.email,
      subject: `Your proposal from ${org.name} - ${proposal.survey.title}`,
      html,
    })

    await db.proposal.update({
      where: { id: proposal.id },
      data: { status: "SENT", sentAt: new Date(), clientEmail: to },
    })

    return NextResponse.json({ success: true, url })
  } catch (error) {
    console.error("Send proposal error:", error)
    return NextResponse.json(
      { error: "Failed to send the email. Please try again." },
      { status: 500 }
    )
  }
}
