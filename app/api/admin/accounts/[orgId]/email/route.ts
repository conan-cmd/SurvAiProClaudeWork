import { NextRequest, NextResponse } from "next/server"
import { z } from "zod"
import { db } from "@/lib/db"
import { getCurrentUser } from "@/lib/session"
import { isPlatformAdmin } from "@/lib/admin"
import { emailEnabled, sendEmail } from "@/lib/email"

const emailSchema = z.object({
  to: z.string().trim().min(3).max(300),
  subject: z.string().trim().min(1).max(200),
  message: z.string().trim().min(1).max(5000),
})

// Platform admin emails an account straight from the usage dashboard. Sent
// from the admin's own Gmail when connected (replies come back to them),
// otherwise the shared sender.
export async function POST(request: NextRequest, { params }: { params: { orgId: string } }) {
  const user = await getCurrentUser()
  if (!isPlatformAdmin(user) || !user) return NextResponse.json({ error: "Forbidden" }, { status: 403 })
  if (!emailEnabled()) return NextResponse.json({ error: "Email isn't configured on the server" }, { status: 503 })

  const org = await db.organization.findUnique({ where: { id: params.orgId }, select: { id: true } })
  if (!org) return NextResponse.json({ error: "Not found" }, { status: 404 })

  const parsed = emailSchema.safeParse(await request.json().catch(() => ({})))
  if (!parsed.success) return NextResponse.json({ error: "Fill in recipient, subject and message" }, { status: 400 })
  const { to, subject, message } = parsed.data

  const recipients = to.split(/[,;\s]+/).map((e) => e.trim()).filter((e) => /.+@.+\..+/.test(e))
  if (!recipients.length) return NextResponse.json({ error: "Enter a valid recipient email" }, { status: 400 })

  const safe = message.replace(/</g, "&lt;").replace(/\n/g, "<br/>")
  const signoff = user.name || "The SurvAIPro® team"
  try {
    await sendEmail({
      to: recipients,
      subject,
      fromUserId: user.id,
      replyTo: user.email,
      html: `
        <div style="font-family:-apple-system,'Segoe UI',Roboto,Arial,sans-serif;font-size:15px;line-height:1.7;color:#111827;max-width:560px">
          <p>${safe}</p>
          <p style="margin-top:20px">${signoff}<br/><span style="color:#6b7280;font-size:13px">SurvAIPro®</span></p>
        </div>`,
      text: `${message}\n\n${signoff}\nSurvAIPro®`,
    })
    return NextResponse.json({ success: true })
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Couldn't send the email" },
      { status: 502 }
    )
  }
}
