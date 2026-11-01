import "server-only"
import { randomBytes } from "crypto"
import { db } from "@/lib/db"
import { sendEmail } from "@/lib/email"
import { resolveProposalIdentity } from "@/lib/proposal-identity"
import { slugify } from "@/lib/utils"
import { publicBaseUrl } from "@/lib/public-url"
import { parseNudgeTemplates, parseNudgeHistory, type NudgeRecord } from "@/lib/nudge"

export type NudgeOptions = {
  templateId?: string
  message?: string
  messageName?: string
  mediaUrl?: string
  mediaType?: "video" | "audio"
  mediaPosterUrl?: string
}

export type NudgeSender = { id: string; name: string | null; email: string }

// The nudge email itself — shared by the immediate send (API route) and the
// scheduler (cron/traffic processor), which has no request or session. Guards
// throw plain Errors with user-presentable messages.
export async function performNudge(
  proposalId: string,
  opts: NudgeOptions,
  sender: NudgeSender,
  origin = ""
): Promise<{ lastNudgeAt: Date | null; nudgeHistory: string | null }> {
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
  // Chase-able until the money lands: unsigned proposals need the signature,
  // signed ones may still owe their deposit. Paid = nothing to nudge for.
  if (proposal.depositPaidAt || proposal.status === "DEPOSIT_PAID") {
    throw new Error("This proposal's deposit is already paid — nothing to chase")
  }
  if (!proposal.clientEmail) {
    throw new Error("No client email on this proposal — send it first, or add the client's email.")
  }

  const identity = await resolveProposalIdentity(proposal)
  const org = proposal.organization

  // Which message: an inline custom one wins; otherwise the requested template,
  // else the first configured/default.
  const templates = parseNudgeTemplates(org)
  const template = opts.message
    ? { id: "custom", name: opts.messageName || "Custom message", body: opts.message }
    : templates.find((t) => t.id === opts.templateId) || templates[0]

  // Fresh secure link, same as a normal send.
  const token = randomBytes(16).toString("base64url")
  // Links no longer expire — far-future date satisfies the non-null column.
  const expiresAt = new Date(Date.now() + 100 * 365 * 24 * 60 * 60 * 1000)
  await db.shareLink.create({ data: { proposalId: proposal.id, token, expiresAt } })
  const url = `${publicBaseUrl(origin)}/p/${slugify(proposal.survey.title || "proposal")}/${token}`

  const message = template.body.trim()
  const safeMsg = message.replace(/</g, "&lt;").replace(/\n/g, "<br/>")
  // A recorded video/voice note plays in a banner on the proposal page, so the
  // email leads with it and the link does double duty.
  const media = opts.mediaUrl && opts.mediaType
    ? { url: opts.mediaUrl, type: opts.mediaType, poster: opts.mediaPosterUrl || null }
    : null
  const senderFirst = (identity.name || sender.name || org.name).split(/\s+/)[0]
  const mediaLine = media
    ? media.type === "video"
      ? `${senderFirst} has recorded you a short video message — it plays at the top of your proposal.`
      : `${senderFirst} has recorded you a voice message — it plays at the top of your proposal.`
    : null
  // Already-signed deals are being chased for the deposit, not a signature.
  const baseLabelHtml = proposal.signedAt
    ? "Open your proposal &amp; pay your deposit"
    : "Review &amp; sign your proposal"
  const baseLabelText = proposal.signedAt
    ? "Open your proposal & pay your deposit"
    : "Review & sign your proposal"
  const linkLabel = media
    ? media.type === "video" ? "Watch the message &amp; view your proposal" : "Listen &amp; view your proposal"
    : baseLabelHtml
  // Loom-style circular preview: a real frame from the recording (or the
  // sender's headshot for voice notes), the whole thing linked — so the email
  // clearly shows a genuine video, not just a bare link.
  const posterImg = media
    ? media.type === "video" && media.poster
      ? { src: media.poster, alt: "Play the video message", size: 132 }
      : media.type === "audio" && identity.headshotUrl
        ? { src: identity.headshotUrl, alt: `${senderFirst}'s voice message`, size: 104 }
        : null
    : null
  const posterHtml = posterImg
    ? `<p style="margin:18px 0 6px"><a href="${url}" style="text-decoration:none">
        <img src="${posterImg.src}" width="${posterImg.size}" height="${posterImg.size}" alt="${posterImg.alt}"
          style="display:block;border-radius:50%;border:3px solid #2563EB;object-fit:cover" />
      </a></p>
      <p style="margin:0 0 14px"><a href="${url}" style="color:#2563EB;font-weight:600;font-size:13px">
        ${media!.type === "video" ? "&#9654; Play video message" : "&#127908; Play voice message"}</a></p>`
    : ""
  const html = `
    <div style="font-family:-apple-system,'Segoe UI',Roboto,Arial,sans-serif;font-size:15px;line-height:1.6;color:#111827;max-width:520px">
      <p>Hi ${proposal.clientName.split(/\s+/)[0]},</p>
      ${mediaLine ? `<p>${media!.type === "video" ? "🎥" : "🎙"} <strong>${mediaLine}</strong></p>` : ""}
      ${posterHtml}
      <p>${safeMsg}</p>
      <p style="margin:20px 0"><a href="${url}" style="color:#2563EB;font-weight:600">${linkLabel} &rarr;</a></p>
      <p>Any questions at all, just reply to this email.</p>
      <p>Kind regards,<br/>${identity.name || sender.name || org.name}${org.phone ? `<br/>${org.phone}` : ""}</p>
    </div>`
  const text = [
    `Hi ${proposal.clientName.split(/\s+/)[0]},`,
    "",
    ...(mediaLine ? [mediaLine, ""] : []),
    message,
    "",
    `${media ? (media.type === "video" ? "Watch the message & view your proposal" : "Listen & view your proposal") : baseLabelText}: ${url}`,
    "",
    "Any questions at all, just reply to this email.",
    "",
    "Kind regards,",
    `${identity.name || sender.name || org.name}${org.phone ? `\n${org.phone}` : ""}`,
  ].join("\n")

  await sendEmail({
    to: proposal.clientEmail,
    replyTo: identity.email || org.email || sender.email,
    subject: media
      ? `A ${media.type === "video" ? "video" : "voice"} message about your proposal from ${org.name}`
      : `Your proposal from ${org.name} — ready when you are`,
    html,
    text,
    fromUserId: identity.userId ?? sender.id,
  })

  const record: NudgeRecord = {
    at: new Date().toISOString(),
    templateName: template.name,
    by: sender.name || sender.email,
    ...(media ? { mediaUrl: media.url, mediaType: media.type, ...(media.poster ? { mediaPosterUrl: media.poster } : {}) } : {}),
  }
  const history = [...parseNudgeHistory(proposal.nudgeHistory), record]
  return db.proposal.update({
    where: { id: proposal.id },
    data: { lastNudgeAt: new Date(), nudgeHistory: JSON.stringify(history) },
    select: { lastNudgeAt: true, nudgeHistory: true },
  })
}
