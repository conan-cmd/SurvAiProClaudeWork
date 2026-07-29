import { NextRequest, NextResponse } from "next/server"
import { z } from "zod"
import { db } from "@/lib/db"
import { getCurrentUser } from "@/lib/session"

const schema = z.object({ code: z.string().min(2).max(60) })

// A user redeems an access code → their org gets free access (revocable).
export async function POST(request: NextRequest) {
  const user = await getCurrentUser()
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  const parsed = schema.safeParse(await request.json())
  if (!parsed.success) return NextResponse.json({ error: "Enter a valid code" }, { status: 400 })

  const code = await db.accessCode.findUnique({ where: { code: parsed.data.code.trim() } })
  if (!code || !code.active) {
    return NextResponse.json({ error: "That code isn't valid." }, { status: 400 })
  }
  if (code.uses >= code.maxUses) {
    return NextResponse.json({ error: "That code has already been used." }, { status: 400 })
  }

  await db.$transaction([
    db.accessCode.update({ where: { id: code.id }, data: { uses: { increment: 1 } } }),
    db.organization.update({
      where: { id: user.organizationId },
      data: { freeAccess: true, accessCodeId: code.id },
    }),
  ])

  return NextResponse.json({ success: true })
}
