import { NextRequest, NextResponse } from "next/server"
import { createHash, randomBytes } from "crypto"
import { z } from "zod"
import { db } from "@/lib/db"
import { emailEnabled, sendEmail } from "@/lib/email"
import { publicBaseUrl } from "@/lib/public-url"

const schema = z.object({ email: z.string().trim().email() })

// Sends a one-hour password-reset link. Always answers success so the form
// can't be used to probe which emails have accounts.
export async function POST(request: NextRequest) {
  const parsed = schema.safeParse(await request.json().catch(() => ({})))
  if (!parsed.success) return NextResponse.json({ error: "Enter your email address" }, { status: 400 })

  const user = await db.user.findUnique({
    where: { email: parsed.data.email.toLowerCase() },
    select: { id: true, email: true, name: true },
  })
  if (user && emailEnabled()) {
    try {
      const token = randomBytes(32).toString("base64url")
      await db.user.update({
        where: { id: user.id },
        data: {
          resetTokenHash: createHash("sha256").update(token).digest("hex"),
          resetTokenExpiresAt: new Date(Date.now() + 60 * 60 * 1000),
        },
      })
      const url = `${publicBaseUrl(request.nextUrl.origin)}/auth/reset/${token}`
      await sendEmail({
        to: user.email,
        subject: "Reset your SurvAIPro® password",
        html: `
          <div style="font-family:-apple-system,'Segoe UI',Roboto,Arial,sans-serif;font-size:15px;line-height:1.7;color:#111827;max-width:520px">
            <p>Hi${user.name ? ` ${user.name.split(/\s+/)[0]}` : ""},</p>
            <p>Someone asked to reset the password for this SurvAIPro® account. If that was you,
            set a new password here (the link works for one hour):</p>
            <p style="margin:20px 0">
              <a href="${url}" style="background:#2563EB;color:#fff;padding:10px 20px;border-radius:8px;text-decoration:none;font-weight:600">Set a new password</a>
            </p>
            <p style="color:#6b7280;font-size:13px">If you didn't ask for this, you can ignore this email — your password stays as it is.</p>
          </div>`,
        text: `Reset your SurvAIPro password (link valid for one hour):\n${url}\n\nIf you didn't ask for this, ignore this email.`,
      })
    } catch (err) {
      console.error("Password reset email failed:", err)
    }
  }
  return NextResponse.json({ success: true })
}
