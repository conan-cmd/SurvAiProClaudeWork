import { NextRequest, NextResponse } from "next/server"
import { z } from "zod"
import { db } from "@/lib/db"
import { getCurrentUser } from "@/lib/session"
import { deleteFile } from "@/lib/storage"

const updatePhotoSchema = z.object({
  caption: z.string().max(500).optional(),
  order: z.number().int().min(0).optional(),
  isCoverImage: z.boolean().optional(),
  includeInProposal: z.boolean().optional(),
  internalOnly: z.boolean().optional(),
})

async function getScopedPhoto(photoId: string, surveyId: string, organizationId: string) {
  return db.surveyPhoto.findFirst({
    where: { id: photoId, surveyId, survey: { organizationId } },
  })
}

export async function PATCH(
  request: NextRequest,
  { params }: { params: { surveyId: string; photoId: string } }
) {
  const user = await getCurrentUser()
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  const photo = await getScopedPhoto(params.photoId, params.surveyId, user.organizationId)
  if (!photo) return NextResponse.json({ error: "Not found" }, { status: 404 })

  const body = await request.json()
  const parsed = updatePhotoSchema.safeParse(body)
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.errors[0].message }, { status: 400 })
  }

  // Only one cover image per survey
  if (parsed.data.isCoverImage === true) {
    await db.surveyPhoto.updateMany({
      where: { surveyId: params.surveyId, isCoverImage: true },
      data: { isCoverImage: false },
    })
  }

  const updated = await db.surveyPhoto.update({
    where: { id: params.photoId },
    data: parsed.data,
  })

  return NextResponse.json(updated)
}

export async function DELETE(
  _request: NextRequest,
  { params }: { params: { surveyId: string; photoId: string } }
) {
  const user = await getCurrentUser()
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  const photo = await getScopedPhoto(params.photoId, params.surveyId, user.organizationId)
  if (!photo) return NextResponse.json({ error: "Not found" }, { status: 404 })

  try {
    await deleteFile(photo.fileUrl)
  } catch {
    // Blob may already be gone; still remove the DB record.
  }

  await db.surveyPhoto.delete({ where: { id: params.photoId } })
  return NextResponse.json({ success: true })
}
