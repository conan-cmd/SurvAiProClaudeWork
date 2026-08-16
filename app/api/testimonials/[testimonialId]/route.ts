import { NextRequest, NextResponse } from "next/server"
import { z } from "zod"
import { db } from "@/lib/db"
import { getCurrentUser } from "@/lib/session"

const patchSchema = z.object({
  title: z.string().max(150).nullable().optional(),
  serviceTags: z.string().max(300).nullable().optional(),
  audience: z.enum(["ANY", "RESIDENTIAL", "COMMERCIAL"]).optional(),
})

export async function PATCH(
  request: NextRequest,
  { params }: { params: { testimonialId: string } }
) {
  const user = await getCurrentUser()
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  const existing = await db.testimonial.findFirst({
    where: { id: params.testimonialId, organizationId: user.organizationId },
  })
  if (!existing) return NextResponse.json({ error: "Not found" }, { status: 404 })

  const parsed = patchSchema.safeParse(await request.json())
  if (!parsed.success) return NextResponse.json({ error: parsed.error.errors[0].message }, { status: 400 })

  const t = await db.testimonial.update({ where: { id: existing.id }, data: parsed.data })
  return NextResponse.json(t)
}

export async function DELETE(
  _request: NextRequest,
  { params }: { params: { testimonialId: string } }
) {
  const user = await getCurrentUser()
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  const existing = await db.testimonial.findFirst({
    where: { id: params.testimonialId, organizationId: user.organizationId },
  })
  if (!existing) return NextResponse.json({ error: "Not found" }, { status: 404 })
  await db.testimonial.delete({ where: { id: existing.id } })
  return NextResponse.json({ success: true })
}
