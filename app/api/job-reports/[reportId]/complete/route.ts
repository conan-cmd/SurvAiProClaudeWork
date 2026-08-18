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
    select: { id: true, publicToken: true },
  })
  if (!report) return NextResponse.json({ error: "Not found" }, { status: 404 })

  const token = report.publicToken || randomBytes(12).toString("base64url")
  await db.jobReport.update({
    where: { id: report.id },
    data: { status: "COMPLETED", completedAt: new Date(), publicToken: token },
  })

  const origin = publicBaseUrl(request.nextUrl.origin)
  return NextResponse.json({ success: true, url: `${origin}/jr/${token}` })
}
