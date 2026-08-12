import { NextRequest, NextResponse } from "next/server"
import { db } from "@/lib/db"
import { getCurrentUser } from "@/lib/session"
import { canSeeAllJobReports } from "@/lib/permissions"

export async function DELETE(
  _request: NextRequest,
  { params }: { params: { reportId: string; photoId: string } }
) {
  const user = await getCurrentUser()
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  const report = await db.jobReport.findFirst({
    where: {
      id: params.reportId,
      organizationId: user.organizationId,
      ...(canSeeAllJobReports(user) ? {} : { createdById: user.id }),
    },
    select: { id: true },
  })
  if (!report) return NextResponse.json({ error: "Not found" }, { status: 404 })

  const photo = await db.jobReportPhoto.findFirst({ where: { id: params.photoId, jobReportId: report.id } })
  if (!photo) return NextResponse.json({ error: "Not found" }, { status: 404 })

  const { deleteFile } = await import("@/lib/storage")
  await deleteFile(photo.fileUrl).catch(() => {})
  await db.jobReportPhoto.delete({ where: { id: photo.id } })
  return NextResponse.json({ success: true })
}
