import { NextRequest, NextResponse } from "next/server"
import { z } from "zod"
import { db } from "@/lib/db"
import { getCurrentUser } from "@/lib/session"

export async function GET(
  _request: NextRequest,
  { params }: { params: { ramsId: string } }
) {
  const user = await getCurrentUser()
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  const rams = await db.rams.findFirst({
    where: { id: params.ramsId, organizationId: user.organizationId },
    include: {
      survey: {
        select: {
          id: true,
          title: true,
          clientName: true,
          clientAddress: true,
          serviceType: true,
          proposal: { select: { id: true } },
        },
      },
      organization: { select: { name: true, logoUrl: true, brandColor: true, phone: true, email: true } },
    },
  })
  if (!rams) return NextResponse.json({ error: "Not found" }, { status: 404 })
  return NextResponse.json(rams)
}

// Fields are stored as JSON strings; accept arrays/strings and stringify.
const patchSchema = z.object({
  hazards: z.array(z.object({
    hazard: z.string(), whoAtRisk: z.string(), controls: z.string(), ppe: z.string(),
  })).optional(),
  methodStatement: z.array(z.string()).optional(),
  ppe: z.array(z.string()).optional(),
  siteInfo: z.string().nullable().optional(),
})

export async function PATCH(
  request: NextRequest,
  { params }: { params: { ramsId: string } }
) {
  const user = await getCurrentUser()
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  const existing = await db.rams.findFirst({
    where: { id: params.ramsId, organizationId: user.organizationId },
  })
  if (!existing) return NextResponse.json({ error: "Not found" }, { status: 404 })

  const parsed = patchSchema.safeParse(await request.json())
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.errors[0].message }, { status: 400 })
  }

  const data: Record<string, unknown> = {}
  if (parsed.data.hazards !== undefined) data.hazards = JSON.stringify(parsed.data.hazards)
  if (parsed.data.methodStatement !== undefined) data.methodStatement = JSON.stringify(parsed.data.methodStatement)
  if (parsed.data.ppe !== undefined) data.ppe = JSON.stringify(parsed.data.ppe)
  if (parsed.data.siteInfo !== undefined) data.siteInfo = parsed.data.siteInfo

  const rams = await db.rams.update({ where: { id: params.ramsId }, data })
  return NextResponse.json({ success: true, id: rams.id })
}

export async function DELETE(
  _request: NextRequest,
  { params }: { params: { ramsId: string } }
) {
  const user = await getCurrentUser()
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  const existing = await db.rams.findFirst({
    where: { id: params.ramsId, organizationId: user.organizationId },
  })
  if (!existing) return NextResponse.json({ error: "Not found" }, { status: 404 })
  await db.rams.delete({ where: { id: params.ramsId } })
  return NextResponse.json({ success: true })
}
