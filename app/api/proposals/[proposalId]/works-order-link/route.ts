import { NextRequest, NextResponse } from "next/server"
import { randomBytes } from "crypto"
import { db } from "@/lib/db"
import { getCurrentUser } from "@/lib/session"
import { publicBaseUrl } from "@/lib/public-url"

// Mints (reusing if present) the crew-facing works-order link for a proposal.
// Works-order tokens are "wo-" prefixed ShareLinks: /wo only accepts prefixed
// tokens, so a client's proposal token can never open the internal view.
export async function POST(
  request: NextRequest,
  { params }: { params: { proposalId: string } }
) {
  const user = await getCurrentUser()
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  const proposal = await db.proposal.findFirst({
    where: { id: params.proposalId, organizationId: user.organizationId },
    select: { id: true },
  })
  if (!proposal) return NextResponse.json({ error: "Not found" }, { status: 404 })

  let link = await db.shareLink.findFirst({
    where: { proposalId: proposal.id, revoked: false, token: { startsWith: "wo-" } },
  })
  if (!link) {
    link = await db.shareLink.create({
      data: {
        proposalId: proposal.id,
        token: `wo-${randomBytes(16).toString("base64url")}`,
        // Links don't expire — far-future date satisfies the non-null column.
        expiresAt: new Date(Date.now() + 100 * 365 * 24 * 60 * 60 * 1000),
      },
    })
  }

  const origin = publicBaseUrl(request.nextUrl.origin)
  return NextResponse.json({ url: `${origin}/wo/${link.token}` })
}
