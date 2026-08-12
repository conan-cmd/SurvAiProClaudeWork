import { NextRequest, NextResponse } from "next/server"
import { z } from "zod"
import { db } from "@/lib/db"
import { getCurrentUser } from "@/lib/session"
import { canSeeAllJobReports } from "@/lib/permissions"

const schema = z.object({
  photos: z.array(z.object({
    url: z.string().url(),
    fileName: z.string(),
    fileSize: z.number().int().nonnegative(),
  })).min(1).max(30),
})

// Creates JobReportPhoto records for files already streamed to Blob storage.
export async function POST(request: NextRequest, { params }: { params: { reportId: string } }) {
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

  const parsed = schema.safeParse(await request.json())
  if (!parsed.success) return NextResponse.json({ error: parsed.error.errors[0].message }, { status: 400 })

  const start = await db.jobReportPhoto.count({ where: { jobReportId: report.id } })
  const created = await db.$transaction(
    parsed.data.photos.map((p, i) =>
      db.jobReportPhoto.create({
        data: { jobReportId: report.id, fileUrl: p.url, fileName: p.fileName, fileSize: p.fileSize, order: start + i },
      })
    )
  )
  return NextResponse.json(created)
}
