import { NextRequest, NextResponse } from "next/server"
import { z } from "zod"
import { db } from "@/lib/db"
import { getCurrentUser } from "@/lib/session"
import { deleteFile } from "@/lib/storage"

const updateSchema = z.object({
  caption: z.string().max(500).optional(),
  tags: z.string().max(300).optional(),
})

export async function PATCH(
  request: NextRequest,
  { params }: { params: { photoId: string } }
) {
  const user = await getCurrentUser()
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  const photo = await db.galleryPhoto.findFirst({
    where: { id: params.photoId, organizationId: user.organizationId },
  })
  if (!photo) return NextResponse.json({ error: "Not found" }, { status: 404 })

  const parsed = updateSchema.safeParse(await request.json())
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.errors[0].message }, { status: 400 })
  }

  const updated = await db.galleryPhoto.update({
    where: { id: params.photoId },
    data: parsed.data,
  })
  return NextResponse.json(updated)
}

export async function DELETE(
  _request: NextRequest,
  { params }: { params: { photoId: string } }
) {
  const user = await getCurrentUser()
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  const photo = await db.galleryPhoto.findFirst({
    where: { id: params.photoId, organizationId: user.organizationId },
  })
  if (!photo) return NextResponse.json({ error: "Not found" }, { status: 404 })

  try {
    await deleteFile(photo.fileUrl)
  } catch {
    // record removal matters more than blob cleanup
  }
  await db.galleryPhoto.delete({ where: { id: params.photoId } })
  return NextResponse.json({ success: true })
}
