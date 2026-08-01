import { NextRequest, NextResponse } from "next/server"
import { z } from "zod"
import { db } from "@/lib/db"
import { getCurrentUser } from "@/lib/session"
import { isApprover } from "@/lib/permissions"
import { canSend, sendEmail } from "@/lib/email"
import { publicBaseUrl } from "@/lib/public-url"

const schema = z.object({
  decision: z.enum(["approve", "changes"]),
  note: z.string().max(2000).optional(),
})

// An approver signs a proposal off, or sends it back with a note.
export async function POST(
  request: NextRequest,
  { params }: { params: { proposalId: string } }
) {
  const user = await getCurrentUser()
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  if (!isApprover(user)) {
    return NextResponse.json({ error: "Only owners and admins can sign off proposals." }, { status: 403 })
  }

  const parsed = schema.safeParse(await request.json())
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.errors[0].message }, { status: 400 })
  }
  const { decision, note } = parsed.data

  const proposal = await db.proposal.findFirst({
    where: { id: params.proposalId, organizationId: user.organizationId },
    include: { survey: { select: { title: true } } },
  })
  if (!proposal) return NextResponse.json({ error: "Not found" }, { status: 404 })

  const approved = decision === "approve"
  const updated = await db.proposal.update({
    where: { id: proposal.id },
    data: {
      approvalStatus: approved ? "APPROVED" : "CHANGES_REQUESTED",
      reviewedById: user.id,
      reviewedAt: new Date(),
      reviewNote: approved ? null : (note || null),
    },
    select: { approvalStatus: true, reviewedAt: true, reviewNote: true },
  })

  // Best-effort: let the drafter know the outcome.
  try {
    if (proposal.submittedById && (await canSend(user.id))) {
      const drafter = await db.user.findUnique({ where: { id: proposal.submittedById }, select: { email: true } })
      if (drafter?.email && drafter.email !== user.email) {
        const origin = publicBaseUrl(request.nextUrl.origin)
        const link = `${origin}/proposals/${proposal.id}`
        await sendEmail({
          to: drafter.email,
          replyTo: user.email,
          fromUserId: user.id,
          subject: approved
            ? `Approved: proposal for ${proposal.clientName}`
            : `Changes requested: proposal for ${proposal.clientName}`,
          html: `<div style="font-family:-apple-system,'Segoe UI',Roboto,Arial,sans-serif;font-size:15px;line-height:1.6;color:#111827;max-width:520px"><p>${user.name || "An approver"} has ${approved ? "approved" : "requested changes on"} your proposal for <strong>${proposal.clientName}</strong> (${proposal.survey.title}).</p>${!approved && note ? `<p style="background:#FEF3C7;padding:10px 12px;border-radius:8px">${note.replace(/</g, "&lt;").replace(/\n/g, "<br/>")}</p>` : ""}<p style="margin:20px 0"><a href="${link}" style="color:#2563EB;font-weight:600">${approved ? "Send it now" : "Open the proposal"} &rarr;</a></p></div>`,
          text: `${user.name || "An approver"} has ${approved ? "approved" : "requested changes on"} your proposal for ${proposal.clientName} (${proposal.survey.title}).${!approved && note ? `\n\nNote: ${note}` : ""}\n\n${link}`,
        }).catch(() => {})
      }
    }
  } catch (err) {
    console.error("Review-outcome email failed:", err)
  }

  return NextResponse.json(updated)
}
