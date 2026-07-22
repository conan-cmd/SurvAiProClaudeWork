import { NextRequest, NextResponse } from "next/server"
import { z } from "zod"
import { db } from "@/lib/db"
import { getCurrentUser } from "@/lib/session"

export async function GET() {
  const user = await getCurrentUser()
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  const conn = await db.user.findUnique({
    where: { id: user.id },
    select: { gmailAddress: true },
  })
  return NextResponse.json({
    id: user.id,
    name: user.name,
    email: user.email,
    signOffName: user.signOffName,
    headshotUrl: user.headshotUrl,
    signatureImageUrl: user.signatureImageUrl,
    gmailAddress: conn?.gmailAddress ?? null,
  })
}

const patchSchema = z.object({
  signOffName: z.string().max(100).optional(),
  name: z.string().max(100).optional(),
})

export async function PATCH(request: NextRequest) {
  const user = await getCurrentUser()
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  const parsed = patchSchema.safeParse(await request.json())
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.errors[0].message }, { status: 400 })
  }
  const updated = await db.user.update({ where: { id: user.id }, data: parsed.data })
  return NextResponse.json({ signOffName: updated.signOffName, name: updated.name })
}
