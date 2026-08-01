import { NextRequest, NextResponse } from "next/server"
import { db } from "@/lib/db"
import { getCurrentUser } from "@/lib/session"
import { canSend, sendEmail } from "@/lib/email"
import { publicBaseUrl } from "@/lib/public-url"

// A drafter (or anyone) sends a proposal to an approver for sign-off.
export async function POST(
  request: NextRequest,
  { params }: { params: { proposalId: string } }
) {
  const user = await getCurrentUser()
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  const proposal = await db.proposal.findFirst({
    where: { id: params.proposalId, organizationId: user.organizationId },
    include: { survey: { select: { title: true } } },
  })
  if (!proposal) return NextResponse.json({ error: "Not found" }, { status: 404 })

  const updated = await db.proposal.update({
    where: { id: proposal.id },
    data: {
      approvalStatus: "PENDING",
      submittedById: user.id,
      submittedAt: new Date(),
      reviewNote: null,
    },
    select: { approvalStatus: true, submittedAt: true },
  })

  // Best-effort: tell the approvers there's something to review.
  try {
    if (await canSend(user.id)) {
      const approvers = await db.user.findMany({
        where: { organizationId: user.organizationId, role: { in: ["OWNER", "ADMIN"] }, email: { not: user.email } },
        select: { email: true },
      })
      const origin = publicBaseUrl(request.nextUrl.origin)
      const link = `${origin}/reviews`
      for (const a of approvers) {
        await sendEmail({
          to: a.email,
          replyTo: user.email,
          fromUserId: user.id,
          subject: `Proposal to review: ${proposal.clientName}`,
          html: `<div style="font-family:-apple-system,'Segoe UI',Roboto,Arial,sans-serif;font-size:15px;line-height:1.6;color:#111827;max-width:520px"><p>${user.name || "A team member"} has submitted a proposal for <strong>${proposal.clientName}</strong> (${proposal.survey.title}) for your sign-off.</p><p style="margin:20px 0"><a href="${link}" style="color:#2563EB;font-weight:600">Review it &rarr;</a></p></div>`,
          text: `${user.name || "A team member"} submitted a proposal for ${proposal.clientName} (${proposal.survey.title}) for your sign-off.\n\nReview it: ${link}`,
        }).catch(() => {})
      }
    }
  } catch (err) {
    console.error("Review-request email failed:", err)
  }

  return NextResponse.json(updated)
}
