import { NextRequest, NextResponse } from "next/server"
import { z } from "zod"
import { db } from "@/lib/db"
import { getCurrentUser } from "@/lib/session"
import { canSend } from "@/lib/email"
import { canSendProposal } from "@/lib/permissions"
import { performProposalSend } from "@/lib/proposal-send"

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
// The send itself lives in lib/proposal-send.ts (shared with the assistant).
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
    select: { id: true, status: true, approvalStatus: true, createdById: true },
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

  try {
    const { url } = await performProposalSend(
      proposal.id,
      { to: recipients, message: parsed.data.message, documentIds: parsed.data.documentIds },
      { id: user.id, name: user.name, email: user.email },
      request.nextUrl.origin
    )
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
