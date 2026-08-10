import { NextRequest, NextResponse } from "next/server"
import { randomBytes } from "crypto"
import { db } from "@/lib/db"
import { getCurrentUser } from "@/lib/session"
import { canSeeAllJobReports } from "@/lib/permissions"
import { canSend, sendEmail } from "@/lib/email"
import { publicBaseUrl } from "@/lib/public-url"

const esc = (s: string) => String(s || "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")

// Marks the report completed, mints a client-viewable link, and emails it to the
// office (org contact email) so they can forward it to the client at invoicing.
export async function POST(request: NextRequest, { params }: { params: { reportId: string } }) {
  const user = await getCurrentUser()
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  const report = await db.jobReport.findFirst({
    where: {
      id: params.reportId,
      organizationId: user.organizationId,
      ...(canSeeAllJobReports(user) ? {} : { createdById: user.id }),
    },
    include: {
      site: true,
      organization: {
        select: {
          name: true,
          email: true,
          users: { where: { role: "OWNER" }, select: { email: true }, take: 1 },
        },
      },
    },
  })
  if (!report) return NextResponse.json({ error: "Not found" }, { status: 404 })

  const token = report.publicToken || randomBytes(12).toString("base64url")
  await db.jobReport.update({
    where: { id: report.id },
    data: { status: "COMPLETED", completedAt: new Date(), publicToken: token },
  })

  const origin = publicBaseUrl(request.nextUrl.origin)
  const link = `${origin}/jr/${token}`

  // Email the office (best-effort — never fails the completion).
  try {
    if (await canSend(user.id)) {
      const to = report.organization.email || report.organization.users[0]?.email || user.email
      if (to) {
        const site = report.site
        const who = report.technicianName || user.name || "a contractor"
        await sendEmail({
          to,
          replyTo: user.email,
          subject: `Job report — ${site.clientName} (${site.address})`,
          html: `<div style="font-family:-apple-system,'Segoe UI',Roboto,Arial,sans-serif;font-size:15px;line-height:1.6;color:#111827;max-width:520px">
            <p>A job report has been completed by <strong>${esc(who)}</strong>.</p>
            <p><strong>Client:</strong> ${esc(site.clientName)}<br/><strong>Site:</strong> ${esc(site.address)}</p>
            <p style="margin:20px 0"><a href="${link}" style="color:#2563EB;font-weight:600">View the report &rarr;</a></p>
            <p style="color:#6b7280;font-size:13px">Open the link to view and download the PDF, then forward it to the client.</p>
          </div>`,
          text: `Job report completed for ${site.clientName} (${site.address}).\n\nView & download PDF: ${link}`,
        })
      }
    }
  } catch (err) {
    console.error("Job report email failed:", err)
  }

  return NextResponse.json({ success: true, url: link })
}
