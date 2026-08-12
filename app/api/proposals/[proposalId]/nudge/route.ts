import { NextRequest, NextResponse } from "next/server"
import { randomBytes } from "crypto"
import { db } from "@/lib/db"
import { getCurrentUser } from "@/lib/session"
import { canSend, sendEmail } from "@/lib/email"
import { resolveProposalIdentity } from "@/lib/proposal-identity"
import { slugify } from "@/lib/utils"
import { publicBaseUrl } from "@/lib/public-url"
import { DEFAULT_NUDGE_MESSAGE } from "@/lib/nudge"

// Sends the client a gentle follow-up on an unsigned proposal — e.g. after a
// verbal go-ahead. Body text comes from Organization.nudgeMessage (Settings),
// falling back to the app default.
export async function POST(
  request: NextRequest,
  { params }: { params: { proposalId: string } }
) {
  const user = await getCurrentUser()
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  if (!(await canSend(user.id))) {
    return NextResponse.json(
      { error: "Email isn't set up yet — connect your email in Settings first." },
      { status: 503 }
    )
  }

  const proposal = await db.proposal.findFirst({
    where: { id: params.proposalId, organizationId: user.organizationId },
    include: {
      organization: true,
      survey: { select: { title: true } },
      createdBy: {
        select: { id: true, name: true, email: true, signOffName: true, headshotUrl: true, signatureImageUrl: true },
      },
    },
  })
  if (!proposal) return NextResponse.json({ error: "Not found" }, { status: 404 })
  if (proposal.signedAt || ["SIGNED", "DEPOSIT_PAID", "WON"].includes(proposal.status)) {
    return NextResponse.json({ error: "This proposal is already accepted" }, { status: 409 })
  }
  if (!proposal.clientEmail) {
    return NextResponse.json(
      { error: "No client email on this proposal — send it first, or add the client's email." },
      { status: 400 }
    )
  }

  const identity = await resolveProposalIdentity(proposal)
  const org = proposal.organization

  // Fresh secure link, same as a normal send.
  const token = randomBytes(16).toString("base64url")
  const expiresAt = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000)
  await db.shareLink.create({ data: { proposalId: proposal.id, token, expiresAt } })
  const origin = publicBaseUrl(request.nextUrl.origin)
  const url = `${origin}/p/${slugify(proposal.survey.title || "proposal")}/${token}`

  const message = (org.nudgeMessage || DEFAULT_NUDGE_MESSAGE).trim()
  const safeMsg = message.replace(/</g, "&lt;").replace(/\n/g, "<br/>")
  const html = `
    <div style="font-family:-apple-system,'Segoe UI',Roboto,Arial,sans-serif;font-size:15px;line-height:1.6;color:#111827;max-width:520px">
      <p>Hi ${proposal.clientName.split(/\s+/)[0]},</p>
      <p>${safeMsg}</p>
      <p style="margin:20px 0"><a href="${url}" style="color:#2563EB;font-weight:600">Review &amp; sign your proposal &rarr;</a></p>
      <p>Any questions at all, just reply to this email.</p>
      <p>Kind regards,<br/>${identity.name || user.name || org.name}${org.phone ? `<br/>${org.phone}` : ""}</p>
    </div>`
  const text = [
    `Hi ${proposal.clientName.split(/\s+/)[0]},`,
    "",
    message,
    "",
    `Review & sign your proposal: ${url}`,
    "",
    "Any questions at all, just reply to this email.",
    "",
    "Kind regards,",
    `${identity.name || user.name || org.name}${org.phone ? `\n${org.phone}` : ""}`,
  ].join("\n")

  try {
    await sendEmail({
      to: proposal.clientEmail,
      replyTo: identity.email || org.email || user.email,
      subject: `Your proposal from ${org.name} — ready when you are`,
      html,
      text,
      fromUserId: identity.userId ?? user.id,
    })
    const updated = await db.proposal.update({
      where: { id: proposal.id },
      data: { lastNudgeAt: new Date() },
      select: { lastNudgeAt: true },
    })
    return NextResponse.json({ success: true, lastNudgeAt: updated.lastNudgeAt })
  } catch (error) {
    console.error("Nudge email error:", error)
    const msg =
      error instanceof Error && error.message
        ? `Couldn't send: ${error.message}`
        : "Failed to send the reminder. Please try again."
    return NextResponse.json({ error: msg }, { status: 500 })
  }
}
