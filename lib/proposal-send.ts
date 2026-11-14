import "server-only"
import { randomBytes } from "crypto"
import { db } from "./db"
import { sendEmail } from "./email"
import { resolveProposalIdentity } from "./proposal-identity"
import { syncProposalToPipedrive } from "./pipedrive"
import { slugify } from "./utils"
import { publicBaseUrl } from "./public-url"

export type SendSender = { id: string; name: string | null; email: string }

// The proposal send itself — extracted from the API route (same pattern as
// lib/nudge-send.ts) so the voice assistant can send after user confirmation.
// Permission checks (canSend / canSendProposal) stay with the callers.
export async function performProposalSend(
  proposalId: string,
  opts: { to: string[]; message?: string; documentIds?: string[] },
  sender: SendSender,
  origin = ""
): Promise<{ url: string }> {
  const proposal = await db.proposal.findUnique({
    where: { id: proposalId },
    include: {
      organization: true,
      survey: { select: { title: true } },
      createdBy: {
        select: { id: true, name: true, email: true, signOffName: true, headshotUrl: true, signatureImageUrl: true },
      },
    },
  })
  if (!proposal) throw new Error("Proposal not found")

  const identity = await resolveProposalIdentity(proposal)

  // Fresh secure link for this send (links no longer expire — far-future date
  // satisfies the non-null column).
  const token = randomBytes(16).toString("base64url")
  const expiresAt = new Date(Date.now() + 100 * 365 * 24 * 60 * 60 * 1000)
  await db.shareLink.create({ data: { proposalId: proposal.id, token, expiresAt } })
  const base = publicBaseUrl(origin)
  const slug = slugify(proposal.survey.title || "proposal")
  const url = `${base}/p/${slug}/${token}`

  const org = proposal.organization
  // A plain, personal email (no marketing header/button) reads as a 1-to-1
  // message, which Gmail is far more likely to file under Primary than Updates.
  const safeMsg = opts.message
    ? opts.message.replace(/</g, "&lt;").replace(/\n/g, "<br/>")
    : `Please find your proposal for <strong>${proposal.survey.title}</strong> below.`
  const html = `
    <div style="font-family:-apple-system,'Segoe UI',Roboto,Arial,sans-serif;font-size:15px;line-height:1.6;color:#111827;max-width:520px">
      <p>Dear ${proposal.clientName},</p>
      <p>${safeMsg}</p>
      <p style="margin:20px 0"><a href="${url}" style="color:#2563EB;font-weight:600">View your proposal &rarr;</a></p>
      <p>Any questions at all, just reply to this email.</p>
      <p>Kind regards,<br/>${identity.name || sender.name || org.name}${org.phone ? `<br/>${org.phone}` : ""}</p>
    </div>`
  const text = [
    `Dear ${proposal.clientName},`,
    "",
    opts.message || `Please find your proposal for ${proposal.survey.title} below.`,
    "",
    `View your proposal: ${url}`,
    "",
    "Any questions at all, just reply to this email.",
    "",
    "Kind regards,",
    `${identity.name || sender.name || org.name}${org.phone ? `\n${org.phone}` : ""}`,
  ].join("\n")

  let attachments: { filename: string; path: string }[] | undefined
  if (opts.documentIds?.length) {
    const docs = await db.orgDocument.findMany({
      where: { id: { in: opts.documentIds }, organizationId: proposal.organizationId },
    })
    attachments = docs.map((d) => ({ filename: d.name, path: d.fileUrl }))
  }

  await sendEmail({
    to: opts.to,
    replyTo: identity.email || org.email || sender.email,
    subject: `Your proposal from ${org.name}`,
    html,
    text,
    attachments,
    fromUserId: identity.userId ?? sender.id,
  })

  await db.proposal.update({
    where: { id: proposal.id },
    data: { status: "SENT", sentAt: new Date(), clientEmail: opts.to[0] },
  })

  // Push to Pipedrive (creates/updates the deal). Best-effort — never blocks send.
  await syncProposalToPipedrive(proposal.id)

  return { url }
}
