import { NextRequest, NextResponse } from "next/server"
import { randomBytes } from "crypto"
import { db } from "@/lib/db"
import { getCurrentUser } from "@/lib/session"
import { canSeeAllJobReports } from "@/lib/permissions"
import { publicBaseUrl } from "@/lib/public-url"

// Marks the report completed and mints its client-viewable link. Sending is a
// separate, explicit step (see ./send) — the contractor chooses who gets it.
export async function POST(request: NextRequest, { params }: { params: { reportId: string } }) {
  const user = await getCurrentUser()
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  const report = await db.jobReport.findFirst({
    where: {
      id: params.reportId,
      organizationId: user.organizationId,
      ...(canSeeAllJobReports(user) ? {} : { createdById: user.id }),
    },
    select: {
      id: true,
      publicToken: true,
      status: true,
      visitDate: true,
      site: { select: { clientName: true, clientCompany: true, address: true } },
      organization: { select: { name: true, email: true, reportAlertEmails: true } },
    },
  })
  if (!report) return NextResponse.json({ error: "Not found" }, { status: 404 })

  const token = report.publicToken || randomBytes(12).toString("base64url")
  await db.jobReport.update({
    where: { id: report.id },
    data: { status: "COMPLETED", completedAt: new Date(), publicToken: token },
  })

  const origin = publicBaseUrl(request.nextUrl.origin)
  const publicUrl = `${origin}/jr/${token}`

  // Alert the office (first completion only — re-completing after edits
  // doesn't re-send). Recipients come from Settings → job report alerts,
  // falling back to the org Contact email. Best-effort.
  if (report.status !== "COMPLETED") {
    notifyOffice({
      recipients: (report.organization.reportAlertEmails || report.organization.email || "")
        .split(/[,;\s]+/)
        .map((e) => e.trim())
        .filter((e) => /.+@.+\..+/.test(e)),
      orgName: report.organization.name,
      site: report.site,
      completedBy: `${user.name || user.email}${user.role === "CONTRACTOR" ? " (contractor)" : ""}`,
      reportUrl: `${origin}/reports/visit/${report.id}`,
      publicUrl,
    }).catch((err) => console.error("Report alert email failed:", err))
  }

  return NextResponse.json({ success: true, url: publicUrl })
}

async function notifyOffice(p: {
  recipients: string[]
  orgName: string
  site: { clientName: string; clientCompany: string | null; address: string }
  completedBy: string
  reportUrl: string
  publicUrl: string
}) {
  if (!p.recipients.length) return
  const { emailEnabled, sendEmail } = await import("@/lib/email")
  if (!emailEnabled()) return
  const siteLabel = `${p.site.clientName}${p.site.clientCompany ? ` · ${p.site.clientCompany}` : ""} — ${p.site.address}`
  await sendEmail({
    to: p.recipients,
    subject: `Job report completed — ${p.site.clientName}, ${p.site.address}`,
    html: `
      <div style="font-family:-apple-system,'Segoe UI',Roboto,Arial,sans-serif;font-size:15px;line-height:1.6;color:#111827;max-width:520px">
        <p><strong>${p.completedBy}</strong> has completed a job report.</p>
        <p>${siteLabel}</p>
        <p style="margin:18px 0">
          <a href="${p.reportUrl}" style="color:#2563EB;font-weight:600">Open the report in SurvAIPro &rarr;</a><br/>
          <a href="${p.publicUrl}" style="color:#6B7280;font-size:13px">Client-viewable link</a>
        </p>
      </div>`,
    text: `${p.completedBy} has completed a job report.\n${siteLabel}\n\nOpen in SurvAIPro: ${p.reportUrl}\nClient-viewable link: ${p.publicUrl}`,
  })
}
