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
  if (!link || link.revoked || link.expiresAt < new Date()) {
    return NextResponse.json({ ok: false })
  }

  let body: z.infer<typeof schema>
  try {
    body = schema.parse(await request.json())
  } catch {
    return NextResponse.json({ ok: false })
  }

  try {
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
  } catch {
    // best-effort; never fail the client
  }
  return NextResponse.json({ ok: true })
}
