import { NextRequest, NextResponse } from "next/server"
import { z } from "zod"
import { db } from "@/lib/db"
import { getCurrentUser } from "@/lib/session"
import { canSeeAllJobReports } from "@/lib/permissions"

// Scopes a site to the caller: whole org for owner/admin, own only for contractors.
async function scopedSite(user: { id: string; organizationId: string; role: string }, siteId: string) {
  return db.jobSite.findFirst({
    where: {
      id: siteId,
      organizationId: user.organizationId,
      ...(canSeeAllJobReports(user) ? {} : { createdById: user.id }),
    },
  })
}

export async function GET(_request: NextRequest, { params }: { params: { siteId: string } }) {
  const user = await getCurrentUser()
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  const site = await db.jobSite.findFirst({
    where: {
      id: params.siteId,
      organizationId: user.organizationId,
      ...(canSeeAllJobReports(user) ? {} : { createdById: user.id }),
    },
    include: {
      reports: {
        orderBy: { visitDate: "desc" },
        select: { id: true, visitDate: true, status: true, completedAt: true, createdAt: true },
      },
    },
  })
  if (!site) return NextResponse.json({ error: "Not found" }, { status: 404 })
  return NextResponse.json(site)
}

const patchSchema = z.object({
  clientName: z.string().min(1).optional(),
  clientCompany: z.string().nullable().optional(),
  clientEmail: z.string().email().nullable().optional().or(z.literal("")),
  clientPhone: z.string().nullable().optional(),
  address: z.string().min(1).optional(),
  notes: z.string().nullable().optional(),
})

export async function PATCH(request: NextRequest, { params }: { params: { siteId: string } }) {
  const user = await getCurrentUser()
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  const existing = await scopedSite(user, params.siteId)
  if (!existing) return NextResponse.json({ error: "Not found" }, { status: 404 })

  const parsed = patchSchema.safeParse(await request.json())
  if (!parsed.success) return NextResponse.json({ error: parsed.error.errors[0].message }, { status: 400 })

  const site = await db.jobSite.update({
    where: { id: params.siteId },
    data: { ...parsed.data, clientEmail: parsed.data.clientEmail === "" ? null : parsed.data.clientEmail },
  })
  return NextResponse.json(site)
}

export async function DELETE(_request: NextRequest, { params }: { params: { siteId: string } }) {
  const user = await getCurrentUser()
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  const existing = await scopedSite(user, params.siteId)
  if (!existing) return NextResponse.json({ error: "Not found" }, { status: 404 })
  await db.jobSite.delete({ where: { id: params.siteId } })
  return NextResponse.json({ success: true })
}
