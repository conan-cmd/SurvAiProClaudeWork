import { NextRequest, NextResponse } from "next/server"
import { z } from "zod"
import { db } from "@/lib/db"
import { getCurrentUser } from "@/lib/session"

const schema = z.object({
  message: z.string().min(3, "Please add a little more detail").max(4000),
  context: z.string().max(200).optional(),
})

// Stores in-app beta feedback and emails it to the SurvAIPro team (best-effort).
export async function POST(request: NextRequest) {
  const user = await getCurrentUser()
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  const parsed = schema.safeParse(await request.json())
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.errors[0].message }, { status: 400 })
  }

  const founding = user.organization.isFoundingMember
  await db.feedback.create({
    data: {
      organizationId: user.organizationId,
      userId: user.id,
      userEmail: user.email,
      companyName: user.organization.name,
      isFoundingMember: founding,
      message: parsed.data.message,
      context: parsed.data.context || null,
    },
  })

  // Notify the team (best-effort — never fail the submission).
  try {
    const { emailEnabled, sendEmail } = await import("@/lib/email")
    const to = process.env.FEEDBACK_EMAIL || "conan@lbcclean.co.uk"
    if (emailEnabled()) {
      const esc = (s: string) => String(s).replace(/</g, "&lt;")
      await sendEmail({
        to,
        replyTo: user.email,
        subject: `💬 Feedback${founding ? " (Founding member)" : ""} — ${user.organization.name}`,
        html: `
          <div style="font-family:-apple-system,'Segoe UI',Roboto,Arial,sans-serif;font-size:15px;line-height:1.6;color:#111827;max-width:560px">
            <p style="white-space:pre-wrap;background:#f9fafb;border-radius:8px;padding:12px">${esc(parsed.data.message)}</p>
            <p style="color:#6b7280;font-size:13px">
              From: ${esc(user.name || "")} &lt;${esc(user.email)}&gt;<br/>
              Company: ${esc(user.organization.name)}${founding ? " · <strong>Founding member</strong>" : ""}<br/>
              ${parsed.data.context ? `Page: ${esc(parsed.data.context)}` : ""}
            </p>
          </div>`,
        text: `${parsed.data.message}\n\nFrom: ${user.email} (${user.organization.name})${founding ? " [Founding member]" : ""}\nPage: ${parsed.data.context || "-"}`,
      })
    }
  } catch (e) {
    console.error("Feedback email failed:", e)
  }

  return NextResponse.json({ success: true })
}
