import { NextRequest, NextResponse } from "next/server"
import { z } from "zod"
import { db } from "@/lib/db"
import { getCurrentUser } from "@/lib/session"
import { canSeeAllJobReports } from "@/lib/permissions"

// Creates a new visit report against a site the caller can access.
const schema = z.object({ siteId: z.string().min(1) })

export async function POST(request: NextRequest) {
  const user = await getCurrentUser()
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  const parsed = schema.safeParse(await request.json())
  if (!parsed.success) return NextResponse.json({ error: "A site is required" }, { status: 400 })

  const site = await db.jobSite.findFirst({
    where: {
      id: parsed.data.siteId,
      organizationId: user.organizationId,
      ...(canSeeAllJobReports(user) ? {} : { createdById: user.id }),
    },
  })
  if (!site) return NextResponse.json({ error: "Site not found" }, { status: 404 })

  const report = await db.jobReport.create({
    data: {
      siteId: site.id,
      organizationId: user.organizationId,
      createdById: user.id,
      technicianName: user.name || null,
    },
  })
  return NextResponse.json(report, { status: 201 })
}
