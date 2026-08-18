import { NextRequest, NextResponse } from "next/server"
import { z } from "zod"
import { db } from "@/lib/db"
import { getCurrentUser } from "@/lib/session"
import { canSeeAllJobReports } from "@/lib/permissions"
import { canSend, sendEmail } from "@/lib/email"
import { publicBaseUrl } from "@/lib/public-url"

const bodySchema = z
  .object({
    email: z.string().email().optional(),
    office: z.boolean().optional(),
  })
  .refine((d) => d.email || d.office, { message: "Provide an email or set office" })

const esc = (s: string) => String(s || "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")

// Emails the completed report's link — to the client address the contractor
// entered, or to the office (org contact / owner) with the old forwarding copy.
export async function POST(request: NextRequest, { params }: { params: { reportId: string } }) {
  const user = await getCurrentUser()
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  const parsed = bodySchema.safeParse(await request.json().catch(() => ({})))
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.errors[0].message }, { status: 400 })
  }

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
  if (report.status !== "COMPLETED" || !report.publicToken) {
    return NextResponse.json({ error: "Complete the report before sending it" }, { status: 409 })
  }
  if (!(await canSend(user.id))) {
    return NextResponse.json({ error: "Email sending isn't configured — copy the link instead" }, { status: 503 })
  }

  const site = report.site
  const org = report.organization
  const link = `${publicBaseUrl(request.nextUrl.origin)}/jr/${report.publicToken}`
  const who = report.technicianName || user.name || org.name

  if (parsed.data.email) {
    const to = parsed.data.email.trim()
    await sendEmail({
      to,
      replyTo: user.email,
      subject: `Your visit report from ${org.name} — ${site.address}`,
      html: `<div style="font-family:-apple-system,'Segoe UI',Roboto,Arial,sans-serif;font-size:15px;line-height:1.6;color:#111827;max-width:520px">
        <p>Hi ${esc(site.clientName)},</p>
        <p>Here's the report from our visit to <strong>${esc(site.address)}</strong>, completed by ${esc(who)}.</p>
        <p style="margin:20px 0"><a href="${link}" style="color:#2563EB;font-weight:600">View your report &rarr;</a></p>
        <p style="color:#6b7280;font-size:13px">You can view photos and download a PDF copy from the link. Just reply to this email if you have any questions.</p>
      </div>`,
      text: `Hi ${site.clientName},\n\nHere's the report from our visit to ${site.address}, completed by ${who}.\n\nView it: ${link}\n\nReply to this email with any questions.`,
    })
    // Remember the address on the site so it's prefilled next visit.
    if (!site.clientEmail) {
      await db.jobSite.update({ where: { id: site.id }, data: { clientEmail: to } })
    }
    return NextResponse.json({ success: true })
  }

  const to = org.email || org.users[0]?.email || user.email
  if (!to) return NextResponse.json({ error: "No office email on file — set one in Settings" }, { status: 400 })
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
  return NextResponse.json({ success: true })
}
