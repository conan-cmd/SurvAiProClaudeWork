import { NextRequest, NextResponse } from "next/server"
import { randomBytes } from "crypto"
import { db } from "@/lib/db"
import { getCurrentUser } from "@/lib/session"
import { canSeeAllJobReports } from "@/lib/permissions"
import { publicBaseUrl } from "@/lib/public-url"

// Returns (creating on first use) the public read-only link for a completed
// job report, so the creator can share it directly — same link the office
// email carries. Drafts are refused: /jr/[token] only serves completed reports.
export async function POST(
  request: NextRequest,
  { params }: { params: { reportId: string } }
) {
  const user = await getCurrentUser()
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  const report = await db.jobReport.findFirst({
    where: {
      id: params.reportId,
      organizationId: user.organizationId,
      ...(canSeeAllJobReports(user) ? {} : { createdById: user.id }),
    },
    select: { id: true, status: true, publicToken: true },
  })
  if (!report) return NextResponse.json({ error: "Not found" }, { status: 404 })
  if (report.status !== "COMPLETED") {
    return NextResponse.json(
      { error: "Complete the report first — the link only works once it's completed" },
      { status: 409 }
    )
  }

  let token = report.publicToken
  if (!token) {
    token = randomBytes(12).toString("base64url")
    await db.jobReport.update({ where: { id: report.id }, data: { publicToken: token } })
  }

  const origin = publicBaseUrl(request.nextUrl.origin)
  return NextResponse.json({ url: `${origin}/jr/${token}` })
}
