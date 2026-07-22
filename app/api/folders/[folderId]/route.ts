import { NextRequest, NextResponse } from "next/server"
import { z } from "zod"
import { db } from "@/lib/db"
import { getCurrentUser } from "@/lib/session"

const patchSchema = z.object({ name: z.string().min(1).max(60) })

export async function PATCH(
  request: NextRequest,
  { params }: { params: { folderId: string } }
) {
  const user = await getCurrentUser()
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  const existing = await db.folder.findFirst({
    where: { id: params.folderId, organizationId: user.organizationId },
  })
  if (!existing) return NextResponse.json({ error: "Not found" }, { status: 404 })
  const parsed = patchSchema.safeParse(await request.json())
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.errors[0].message }, { status: 400 })
  }
  const folder = await db.folder.update({
    where: { id: params.folderId },
    data: { name: parsed.data.name.trim() },
  })
  return NextResponse.json(folder)
}

export async function DELETE(
  _request: NextRequest,
  { params }: { params: { folderId: string } }
) {
  const user = await getCurrentUser()
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  const existing = await db.folder.findFirst({
    where: { id: params.folderId, organizationId: user.organizationId },
  })
  if (!existing) return NextResponse.json({ error: "Not found" }, { status: 404 })
  // Surveys in this folder have folderId set to null (onDelete: SetNull).
  await db.folder.delete({ where: { id: params.folderId } })
  return NextResponse.json({ success: true })
}
