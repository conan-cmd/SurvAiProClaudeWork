import { NextRequest, NextResponse } from "next/server"
import { z } from "zod"
import { db } from "@/lib/db"
import { getCurrentUser } from "@/lib/session"
import { canSeeAllJobReports } from "@/lib/permissions"

// Owners/admins see all sites in the org; a contractor sees only their own.
export async function GET() {
  const user = await getCurrentUser()
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  const sites = await db.jobSite.findMany({
    where: {
      organizationId: user.organizationId,
      ...(canSeeAllJobReports(user) ? {} : { createdById: user.id }),
    },
    orderBy: { updatedAt: "desc" },
    include: {
      _count: { select: { reports: true } },
      createdBy: { select: { name: true, email: true } },
    },
  })
  return NextResponse.json(sites)
}

const createSchema = z.object({
  clientName: z.string().min(1, "Client name is required"),
  clientCompany: z.string().optional(),
  clientEmail: z.string().email().optional().or(z.literal("")),
  clientPhone: z.string().optional(),
  address: z.string().min(1, "Site address is required"),
  notes: z.string().optional(),
})

export async function POST(request: NextRequest) {
  const user = await getCurrentUser()
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  const parsed = createSchema.safeParse(await request.json())
  if (!parsed.success) return NextResponse.json({ error: parsed.error.errors[0].message }, { status: 400 })

  const site = await db.jobSite.create({
    data: {
      ...parsed.data,
      clientEmail: parsed.data.clientEmail || null,
      organizationId: user.organizationId,
      createdById: user.id,
    },
  })
  return NextResponse.json(site, { status: 201 })
}
