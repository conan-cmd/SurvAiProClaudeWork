import { NextRequest, NextResponse } from "next/server"
import { randomBytes } from "crypto"
import { db } from "@/lib/db"
import { getCurrentUser } from "@/lib/session"
import { slugify } from "@/lib/utils"

const SHARE_LINK_DAYS = 30

export async function POST(
  request: NextRequest,
  { params }: { params: { proposalId: string } }
) {
  const user = await getCurrentUser()
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  const proposal = await db.proposal.findFirst({
    where: { id: params.proposalId, organizationId: user.organizationId },
    include: { survey: { select: { title: true, clientAddress: true } } },
  })
  if (!proposal) return NextResponse.json({ error: "Not found" }, { status: 404 })

  const token = randomBytes(32).toString("base64url")
  const expiresAt = new Date(Date.now() + SHARE_LINK_DAYS * 24 * 60 * 60 * 1000)

  const link = await db.shareLink.create({
    data: { proposalId: proposal.id, token, expiresAt },
  })

  // Prefer the configured public URL so links work off-device (phones etc.).
  // A readable slug (job title / address) makes the link look legitimate.
  const origin = process.env.NEXTAUTH_URL || request.nextUrl.origin
  const slug = slugify(proposal.survey.title || proposal.survey.clientAddress || "proposal")
  return NextResponse.json({
    url: `${origin}/p/${slug}/${link.token}`,
    expiresAt: link.expiresAt,
  }, { status: 201 })
}

// Revoke all active links for this proposal
export async function DELETE(
  _request: NextRequest,
  { params }: { params: { proposalId: string } }
) {
  const user = await getCurrentUser()
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  const proposal = await db.proposal.findFirst({
    where: { id: params.proposalId, organizationId: user.organizationId },
  })
  if (!proposal) return NextResponse.json({ error: "Not found" }, { status: 404 })

  await db.shareLink.updateMany({
    where: { proposalId: proposal.id, revoked: false },
    data: { revoked: true },
  })

  return NextResponse.json({ success: true })
}
