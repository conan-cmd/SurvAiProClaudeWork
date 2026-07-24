import { NextRequest, NextResponse } from "next/server"
import { randomBytes } from "crypto"
import { db } from "@/lib/db"
import { getCurrentUser } from "@/lib/session"
import { publicBaseUrl } from "@/lib/public-url"

// Returns (creating on first use) the public no-login link operatives use to
// read and sign the RAMS. Shared via WhatsApp / email.
export async function POST(
  request: NextRequest,
  { params }: { params: { ramsId: string } }
) {
  const user = await getCurrentUser()
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  const rams = await db.rams.findFirst({
    where: { id: params.ramsId, organizationId: user.organizationId },
    select: { id: true, publicToken: true },
  })
  if (!rams) return NextResponse.json({ error: "Not found" }, { status: 404 })

  let token = rams.publicToken
  if (!token) {
    token = randomBytes(12).toString("base64url")
    await db.rams.update({ where: { id: rams.id }, data: { publicToken: token } })
  }

  const origin = publicBaseUrl(request.nextUrl.origin)
  return NextResponse.json({ url: `${origin}/r/${token}` })
}
