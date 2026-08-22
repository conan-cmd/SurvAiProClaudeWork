import { NextRequest, NextResponse } from "next/server"
import { randomBytes } from "crypto"
import { z } from "zod"
import { db } from "@/lib/db"
import { getCurrentUser } from "@/lib/session"
import { canSend, sendEmail } from "@/lib/email"
import { canSendProposal } from "@/lib/permissions"
import { resolveProposalIdentity } from "@/lib/proposal-identity"
import { syncProposalToPipedrive } from "@/lib/pipedrive"
import { slugify } from "@/lib/utils"
import { publicBaseUrl } from "@/lib/public-url"

const sendSchema = z.object({
  // One or more recipient emails, separated by commas, semicolons or spaces.
  to: z.string().min(1, "Enter at least one recipient email"),
  message: z.string().max(2000).optional(),
  documentIds: z.array(z.string()).max(20).optional(),
})

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
function parseRecipients(raw: string): string[] {
  return Array.from(new Set(raw.split(/[,;\s]+/).map((s) => s.trim()).filter(Boolean)))
}

// Emails the client a secure link to the proposal and marks it Sent.
export async function POST(
  request: NextRequest,
  { params }: { params: { proposalId: string } }
) {
  const user = await getCurrentUser()
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  if (!(await canSend(user.id))) {
    return NextResponse.json(
      { error: "Email isn't set up yet — connect your email in Settings to send proposals." },
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

  // Draft-only users must have the proposal signed off before it can be sent.
  if (!canSendProposal(user, proposal)) {
    return NextResponse.json(
      { error: "This proposal needs to be signed off by an approver before it can be sent. Use “Submit for review”." },
      { status: 403 }
    )
  }

  const parsed = sendSchema.safeParse(await request.json())
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.errors[0].message }, { status: 400 })
  }
  const { message } = parsed.data
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

  // Who this proposal is sent as: the resolved identity (org default or override).
  const identity = await resolveProposalIdentity(proposal)

  // Fresh secure link for this send
  const token = randomBytes(16).toString("base64url")
  // Links no longer expire — far-future date satisfies the non-null column.
  const expiresAt = new Date(Date.now() + 100 * 365 * 24 * 60 * 60 * 1000)
  await db.shareLink.create({ data: { proposalId: proposal.id, token, expiresAt } })
  const origin = publicBaseUrl(request.nextUrl.origin)
  const slug = slugify(proposal.survey.title || "proposal")
  const url = `${origin}/p/${slug}/${token}`

  const org = proposal.organization
  // A plain, personal email (no marketing header/button) reads as a 1-to-1
  // message, which Gmail is far more likely to file under Primary than Updates.
  const safeMsg = message
    ? message.replace(/</g, "&lt;").replace(/\n/g, "<br/>")
    : `Please find your proposal for <strong>${proposal.survey.title}</strong> below.`
  const html = `
    <div style="font-family:-apple-system,'Segoe UI',Roboto,Arial,sans-serif;font-size:15px;line-height:1.6;color:#111827;max-width:520px">
      <p>Dear ${proposal.clientName},</p>
      <p>${safeMsg}</p>
      <p style="margin:20px 0"><a href="${url}" style="color:#2563EB;font-weight:600">View your proposal &rarr;</a></p>
      <p>Any questions at all, just reply to this email.</p>
      <p>Kind regards,<br/>${identity.name || user.name || org.name}${org.phone ? `<br/>${org.phone}` : ""}</p>
    </div>`
  const text = [
    `Dear ${proposal.clientName},`,
    "",
    message || `Please find your proposal for ${proposal.survey.title} below.`,
    "",
    `View your proposal: ${url}`,
    "",
    "Any questions at all, just reply to this email.",
    "",
    "Kind regards,",
    `${identity.name || user.name || org.name}${org.phone ? `\n${org.phone}` : ""}`,
  ].join("\n")

  try {
    // Attach any selected library documents (insurance, certs).
    let attachments: { filename: string; path: string }[] | undefined
    if (parsed.data.documentIds?.length) {
      const docs = await db.orgDocument.findMany({
        where: { id: { in: parsed.data.documentIds }, organizationId: user.organizationId },
      })
      attachments = docs.map((d) => ({ filename: d.name, path: d.fileUrl }))
    }

    await sendEmail({
      to: recipients,
      // Reply-to and (when they've connected Gmail) the sender are the resolved
      // identity — so a proposal can go out as the business owner, not the drafter.
      replyTo: identity.email || org.email || user.email,
      subject: `Your proposal from ${org.name}`,
      html,
      text,
      attachments,
      fromUserId: identity.userId ?? user.id,
    })

    await db.proposal.update({
      where: { id: proposal.id },
      data: { status: "SENT", sentAt: new Date(), clientEmail: recipients[0] },
    })

    // Push to Pipedrive (creates/updates the deal). Best-effort — never blocks send.
    await syncProposalToPipedrive(proposal.id)

    return NextResponse.json({ success: true, url })
  } catch (error) {
    console.error("Send proposal error:", error)
    // Surface the real reason (e.g. Resend "domain not verified") instead of a
    // generic message, so send failures can actually be diagnosed.
    const msg =
      error instanceof Error && error.message
        ? `Couldn't send: ${error.message}`
        : "Failed to send the email. Please try again."
    return NextResponse.json({ error: msg }, { status: 500 })
  }
}
