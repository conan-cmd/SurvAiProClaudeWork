import { NextRequest, NextResponse } from "next/server"
import { createHash } from "crypto"
import { hash } from "bcryptjs"
import { z } from "zod"
import { db } from "@/lib/db"

const schema = z.object({
  token: z.string().min(10).max(200),
  password: z.string().min(8, "Password must be at least 8 characters"),
})

// Completes a password reset: valid unexpired token -> new password, token
// cleared so the link only works once.
export async function POST(request: NextRequest) {
  const parsed = schema.safeParse(await request.json().catch(() => ({})))
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.errors[0].message }, { status: 400 })
  }

  const tokenHash = createHash("sha256").update(parsed.data.token).digest("hex")
  const user = await db.user.findUnique({ where: { resetTokenHash: tokenHash }, select: { id: true, resetTokenExpiresAt: true } })
  if (!user || !user.resetTokenExpiresAt || user.resetTokenExpiresAt.getTime() < Date.now()) {
    return NextResponse.json(
      { error: "This reset link has expired or already been used — request a new one." },
      { status: 400 }
    )
  }

  await db.user.update({
    where: { id: user.id },
    data: {
      password: await hash(parsed.data.password, 12),
      resetTokenHash: null,
      resetTokenExpiresAt: null,
    },
  })
  return NextResponse.json({ success: true })
}
