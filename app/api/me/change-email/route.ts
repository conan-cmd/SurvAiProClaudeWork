import { NextRequest, NextResponse } from "next/server"
import { compare } from "bcryptjs"
import { z } from "zod"
import { db } from "@/lib/db"
import { getCurrentUser } from "@/lib/session"

const schema = z.object({
  newEmail: z.string().trim().email("Enter a valid email address"),
  password: z.string().min(1, "Enter your current password"),
})

// Change the signed-in user's login email. Password-confirmed (a hijacked
// browser session must not be able to take the account over), and the old
// session dies naturally afterwards — sessions resolve by email — so the user
// signs back in with the new address.
export async function POST(request: NextRequest) {
  const user = await getCurrentUser()
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  const parsed = schema.safeParse(await request.json().catch(() => ({})))
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.errors[0].message }, { status: 400 })
  }
  const newEmail = parsed.data.newEmail.toLowerCase()

  if (!user.password) {
    return NextResponse.json(
      {
        error:
          "This account signs in with Google, so it has no password yet. Use “Forgot password” on the login page to set one first, then change the email.",
      },
      { status: 400 }
    )
  }
  if (!(await compare(parsed.data.password, user.password))) {
    return NextResponse.json({ error: "That password isn't right" }, { status: 403 })
  }

  const taken = await db.user.findUnique({ where: { email: newEmail }, select: { id: true } })
  if (taken && taken.id !== user.id) {
    return NextResponse.json({ error: "That email is already on another account" }, { status: 409 })
  }

  await db.user.update({ where: { id: user.id }, data: { email: newEmail } })
  return NextResponse.json({ success: true })
}
