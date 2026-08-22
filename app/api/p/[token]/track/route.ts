import { NextRequest, NextResponse } from "next/server"
import { z } from "zod"
import { db } from "@/lib/db"

// Public, best-effort: the client beacons how long it spent reading a proposal
// and per-section time. One row per viewing session (upsert by sessionId).
const schema = z.object({
  sessionId: z.string().min(8).max(64),
  totalSeconds: z.number().int().min(0).max(86400),
  sections: z
    .array(z.object({ title: z.string().max(120), seconds: z.number().int().min(0).max(86400) }))
    .max(60)
    .optional(),
})

export async function POST(
  request: NextRequest,
  { params }: { params: { token: string } }
) {
  const link = await db.shareLink.findUnique({
    where: { token: params.token },
    select: { proposalId: true, revoked: true, expiresAt: true },
  })
  if (!link || link.revoked) { // expiry off (2026-08-22); revoke still applies
    return NextResponse.json({ ok: false })
  }

  let body: z.infer<typeof schema>
  try {
    body = schema.parse(await request.json())
  } catch {
    return NextResponse.json({ ok: false })
  }

  try {
    // Was this the proposal's very first view? (used to fire a one-off email)
    const priorCount = await db.proposalView.count({ where: { proposalId: link.proposalId } })

    await db.proposalView.upsert({
      where: { sessionId: body.sessionId },
      create: {
        proposalId: link.proposalId,
        sessionId: body.sessionId,
        totalSeconds: body.totalSeconds,
        sections: body.sections ? JSON.stringify(body.sections) : null,
      },
      update: {
        totalSeconds: body.totalSeconds,
        sections: body.sections ? JSON.stringify(body.sections) : null,
      },
    })

    // First time anyone has opened this proposal → notify the creator once.
    if (priorCount === 0) {
      await notifyFirstView(link.proposalId, request.nextUrl.origin).catch(() => {})
    }
  } catch {
    // best-effort; never fail the client
  }
  return NextResponse.json({ ok: true })
}

// Best-effort "your proposal was opened" email to the proposal's creator (or the
// org email). Fires only on the first-ever view, so it never spams.
async function notifyFirstView(proposalId: string, origin: string) {
  const { emailEnabled, sendEmail } = await import("@/lib/email")
  if (!emailEnabled()) return

  const proposal = await db.proposal.findUnique({
    where: { id: proposalId },
    select: {
      clientName: true,
      survey: { select: { title: true } },
      createdBy: { select: { email: true, name: true } },
      organization: { select: { name: true, email: true } },
    },
  })
  if (!proposal) return
  const to = proposal.createdBy?.email || proposal.organization.email
  if (!to) return

  const { publicBaseUrl } = await import("@/lib/public-url")
  const url = `${publicBaseUrl(origin)}/proposals/${proposalId}`
  const title = proposal.survey.title
  const html = `
    <div style="font-family:-apple-system,'Segoe UI',Roboto,Arial,sans-serif;font-size:15px;line-height:1.6;color:#111827;max-width:520px">
      <p>Good news — <strong>${proposal.clientName}</strong> has just opened your proposal for <strong>${title}</strong>.</p>
      <p style="margin:18px 0"><a href="${url}" style="color:#2563EB;font-weight:600">See how they engaged with it &rarr;</a></p>
      <p style="color:#6b7280;font-size:13px">You'll see time spent and which sections they read on the proposal's Client engagement panel.</p>
    </div>`
  await sendEmail({
    to,
    subject: `👀 ${proposal.clientName} opened your proposal`,
    html,
    text: `${proposal.clientName} has just opened your proposal for ${title}.\n\nView it: ${url}`,
  })
}
