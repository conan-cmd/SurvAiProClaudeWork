import { NextRequest, NextResponse } from "next/server"
import { randomBytes } from "crypto"
import { z } from "zod"
import { db } from "@/lib/db"
import { getCurrentUser } from "@/lib/session"

export async function GET() {
  const user = await getCurrentUser()
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  const [users, invites] = await Promise.all([
    db.user.findMany({
      where: { organizationId: user.organizationId },
      select: { id: true, name: true, email: true, role: true, headshotUrl: true },
      orderBy: { createdAt: "asc" },
    }),
    db.invite.findMany({
      where: { organizationId: user.organizationId, acceptedAt: null, expiresAt: { gt: new Date() } },
      select: { id: true, email: true, token: true, expiresAt: true },
    }),
  ])
  return NextResponse.json({ users, invites })
}

const inviteSchema = z.object({ email: z.string().trim().email("Enter a valid email") })

export async function POST(request: NextRequest) {
  const user = await getCurrentUser()
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  const parsed = inviteSchema.safeParse(await request.json())
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.errors[0].message }, { status: 400 })
  }
  const email = parsed.data.email.toLowerCase()

  const existing = await db.user.findUnique({ where: { email } })
  if (existing) {
    return NextResponse.json({ error: "That email already has an account" }, { status: 409 })
  }

  const token = randomBytes(24).toString("base64url")
  const invite = await db.invite.create({
    data: {
      organizationId: user.organizationId,
      email,
      token,
      expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
    },
  })

  const origin = process.env.NEXTAUTH_URL || request.nextUrl.origin
  const joinUrl = `${origin}/auth/join?token=${token}`

  // Best-effort email; the link is returned either way so it can be shared directly
  if (process.env.RESEND_API_KEY) {
    try {
      await fetch("https://api.resend.com/emails", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${process.env.RESEND_API_KEY}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          from: process.env.EMAIL_FROM || "SurvAIPro <onboarding@resend.dev>",
          to: [email],
          subject: `You've been invited to join ${user.organization.name} on SurvAIPro`,
          html: `<div style="font-family:Inter,Arial,sans-serif;max-width:520px;margin:0 auto"><h2>Join ${user.organization.name}</h2><p>${user.name || "A colleague"} has invited you to their SurvAIPro team.</p><p><a href="${joinUrl}" style="background:#2563EB;color:#fff;padding:12px 24px;border-radius:8px;text-decoration:none;font-weight:bold">Accept invitation</a></p><p style="color:#64748b;font-size:13px">This link expires in 7 days.</p></div>`,
        }),
      })
    } catch (err) {
      console.error("Invite email failed:", err)
    }
  }

  return NextResponse.json({ invite: { id: invite.id, email }, joinUrl }, { status: 201 })
}
