import { NextRequest, NextResponse } from "next/server"
import { db } from "@/lib/db"
import { getCurrentUser } from "@/lib/session"
import { canSend } from "@/lib/email"
import { performNudge } from "@/lib/nudge-send"
import { publicBaseUrl } from "@/lib/public-url"
import { z } from "zod"

const nudgeSchema = z.object({
  templateId: z.string().max(100).optional(),
  // One-off custom message written in the nudge dialog — overrides templateId.
  message: z.string().trim().min(1).max(1000).optional(),
  // How the custom message is labelled in the nudge history.
  messageName: z.string().trim().max(60).optional(),
  // Personal media message uploaded to Blob storage before sending.
  mediaUrl: z.string().url().max(1000).optional(),
  mediaType: z.enum(["video", "audio"]).optional(),
  // Still-frame thumbnail (play badge baked in) for the email body.
  mediaPosterUrl: z.string().url().max(1000).optional(),
  // Boomerang-style schedule: ISO time to send instead of sending now.
  sendAt: z.string().datetime().optional(),
})

// Sends (or schedules) the client a gentle follow-up on an unsigned proposal.
// The email itself lives in lib/nudge-send so the scheduler can fire it too.
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
    select: { id: true, depositPaidAt: true, status: true, clientEmail: true },
  })
  if (!proposal) return NextResponse.json({ error: "Not found" }, { status: 404 })
  if (proposal.depositPaidAt || proposal.status === "DEPOSIT_PAID") {
    return NextResponse.json({ error: "This proposal's deposit is already paid — nothing to chase" }, { status: 409 })
  }
  if (!proposal.clientEmail) {
    return NextResponse.json(
      { error: "No client email on this proposal — send it first, or add the client's email." },
      { status: 400 }
    )
  }

  const parsed = nudgeSchema.safeParse(await request.json().catch(() => ({})))
  if (!parsed.success) return NextResponse.json({ error: "Invalid request" }, { status: 400 })
  const { sendAt, ...opts } = parsed.data

  // Schedule for later (Boomerang-style): stored on the proposal, dispatched
  // by the cron / page-load processor. Scheduling again overwrites.
  if (sendAt && Date.parse(sendAt) > Date.now() + 60_000) {
    if (Date.parse(sendAt) > Date.now() + 60 * 24 * 3600_000) {
      return NextResponse.json({ error: "Pick a time within the next 60 days" }, { status: 400 })
    }
    await db.proposal.update({
      where: { id: proposal.id },
      data: {
        scheduledNudge: JSON.stringify({ ...opts, at: sendAt, by: user.id, byName: user.name || user.email }),
      },
    })
    return NextResponse.json({ scheduled: true, at: sendAt })
  }

  try {
    const updated = await performNudge(
      proposal.id,
      opts,
      { id: user.id, name: user.name, email: user.email },
      publicBaseUrl(request.nextUrl.origin)
    )
    return NextResponse.json({ success: true, lastNudgeAt: updated.lastNudgeAt, nudgeHistory: updated.nudgeHistory })
  } catch (error) {
    console.error("Nudge email error:", error)
    const msg =
      error instanceof Error && error.message
        ? `Couldn't send: ${error.message}`
        : "Failed to send the reminder. Please try again."
    return NextResponse.json({ error: msg }, { status: 500 })
  }
}

// Cancel a scheduled follow-up.
export async function DELETE(
  _request: NextRequest,
  { params }: { params: { proposalId: string } }
) {
  const user = await getCurrentUser()
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  const proposal = await db.proposal.findFirst({
    where: { id: params.proposalId, organizationId: user.organizationId },
    select: { id: true },
  })
  if (!proposal) return NextResponse.json({ error: "Not found" }, { status: 404 })
  await db.proposal.update({ where: { id: proposal.id }, data: { scheduledNudge: null } })
  return NextResponse.json({ success: true })
}
