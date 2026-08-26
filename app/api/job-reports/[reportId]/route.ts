import { NextRequest, NextResponse } from "next/server"
import { z } from "zod"
import { db } from "@/lib/db"
import { getCurrentUser } from "@/lib/session"
import { canSeeAllJobReports } from "@/lib/permissions"

function scopeWhere(user: { id: string; role: string; organizationId: string }, reportId: string) {
  return {
    id: reportId,
    organizationId: user.organizationId,
    ...(canSeeAllJobReports(user) ? {} : { createdById: user.id }),
  }
}

export async function GET(_request: NextRequest, { params }: { params: { reportId: string } }) {
  const user = await getCurrentUser()
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  const report = await db.jobReport.findFirst({
    where: scopeWhere(user, params.reportId),
    include: {
      site: true,
      photos: { orderBy: { order: "asc" } },
      organization: { select: { name: true, logoUrl: true, brandColor: true, secondaryColor: true, phone: true, email: true, website: true } },
    },
  })
  if (!report) return NextResponse.json({ error: "Not found" }, { status: 404 })
  return NextResponse.json(report)
}

const patchSchema = z.object({
  visitDate: z.string().optional(),
  fields: z.record(z.string()).optional(),
  technicianName: z.string().nullable().optional(),
  signatureImage: z.string().nullable().optional(),
})

export async function PATCH(request: NextRequest, { params }: { params: { reportId: string } }) {
  const user = await getCurrentUser()
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  const existing = await db.jobReport.findFirst({ where: scopeWhere(user, params.reportId) })
  if (!existing) return NextResponse.json({ error: "Not found" }, { status: 404 })

  const parsed = patchSchema.safeParse(await request.json())
  if (!parsed.success) return NextResponse.json({ error: parsed.error.errors[0].message }, { status: 400 })

  const data: Record<string, unknown> = {}
  if (parsed.data.visitDate !== undefined) data.visitDate = new Date(parsed.data.visitDate)
  if (parsed.data.fields !== undefined) data.fields = JSON.stringify(parsed.data.fields)
  if (parsed.data.technicianName !== undefined) data.technicianName = parsed.data.technicianName
  if (parsed.data.signatureImage !== undefined) {
    data.signatureImage = parsed.data.signatureImage || null
    data.signedAt = parsed.data.signatureImage ? new Date() : null
  }

  const report = await db.jobReport.update({ where: { id: params.reportId }, data })
  return NextResponse.json(report)
}

export async function DELETE(_request: NextRequest, { params }: { params: { reportId: string } }) {
  const user = await getCurrentUser()
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  const existing = await db.jobReport.findFirst({ where: scopeWhere(user, params.reportId) })
  if (!existing) return NextResponse.json({ error: "Not found" }, { status: 404 })
  await db.jobReport.delete({ where: { id: params.reportId } })
  return NextResponse.json({ success: true })
}
