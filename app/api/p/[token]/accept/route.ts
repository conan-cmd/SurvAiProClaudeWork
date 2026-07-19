import { NextRequest, NextResponse } from "next/server"
import { z } from "zod"
import { db } from "@/lib/db"

const acceptSchema = z.object({
  name: z.string().min(2, "Please enter your full name"),
  position: z.string().max(100).optional(),
  company: z.string().max(150).optional(),
  signature: z.string().startsWith("data:image/").max(500_000),
})

// Public endpoint: the client accepts and signs via their secure share link.
export async function POST(
  request: NextRequest,
  { params }: { params: { token: string } }
) {
  const link = await db.shareLink.findUnique({
    where: { token: params.token },
    include: { proposal: { select: { id: true, status: true, signedAt: true } } },
  })
  if (!link || link.revoked || link.expiresAt < new Date()) {
    return NextResponse.json({ error: "This link is no longer valid" }, { status: 404 })
  }
  if (link.proposal.signedAt || link.proposal.status === "SIGNED" || link.proposal.status === "WON") {
    return NextResponse.json({ error: "This proposal has already been accepted" }, { status: 409 })
  }

  const parsed = acceptSchema.safeParse(await request.json())
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.errors[0].message }, { status: 400 })
  }

  await db.proposal.update({
    where: { id: link.proposal.id },
    data: {
      status: "SIGNED",
      signedAt: new Date(),
      signedName: parsed.data.name,
      signedPosition: parsed.data.position || null,
      signedCompany: parsed.data.company || null,
      signatureImage: parsed.data.signature,
    },
  })

  return NextResponse.json({ success: true })
}
