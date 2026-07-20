import { NextRequest, NextResponse } from "next/server"
import { hash } from "bcryptjs"
import { z } from "zod"
import { db } from "@/lib/db"

const joinSchema = z.object({
  token: z.string().min(10),
  name: z.string().trim().min(1, "Enter your name"),
  password: z.string().min(8, "Password must be at least 8 characters"),
})

// Public: accepts a team invite and creates the member account
export async function POST(request: NextRequest) {
  const parsed = joinSchema.safeParse(await request.json())
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.errors[0].message }, { status: 400 })
  }
  const { token, name, password } = parsed.data

  const invite = await db.invite.findUnique({
    where: { token },
    include: { organization: { select: { name: true } } },
  })
  if (!invite || invite.acceptedAt || invite.expiresAt < new Date()) {
    return NextResponse.json({ error: "This invite is no longer valid" }, { status: 404 })
  }
  if (await db.user.findUnique({ where: { email: invite.email } })) {
    return NextResponse.json({ error: "This email already has an account" }, { status: 409 })
  }

  await db.$transaction([
    db.user.create({
      data: {
        email: invite.email,
        name,
        password: await hash(password, 12),
        organizationId: invite.organizationId,
        role: "MEMBER",
      },
    }),
    db.invite.update({ where: { id: invite.id }, data: { acceptedAt: new Date() } }),
  ])

  return NextResponse.json({ success: true, email: invite.email, organization: invite.organization.name })
}

// Public: invite details for the join page
export async function GET(request: NextRequest) {
  const token = request.nextUrl.searchParams.get("token") || ""
  const invite = await db.invite.findUnique({
    where: { token },
    include: { organization: { select: { name: true } } },
  })
  if (!invite || invite.acceptedAt || invite.expiresAt < new Date()) {
    return NextResponse.json({ error: "This invite is no longer valid" }, { status: 404 })
  }
  return NextResponse.json({ email: invite.email, organization: invite.organization.name })
}
