import { NextRequest, NextResponse } from "next/server"
import { db } from "@/lib/db"
import { getCurrentUser } from "@/lib/session"
import { uploadPhotoWithMetadata } from "@/lib/storage"

const MAX_PHOTO_BYTES = 15 * 1024 * 1024 // 15MB
const ALLOWED_TYPES = ["image/jpeg", "image/png", "image/webp", "image/heic"]

export async function POST(
  request: NextRequest,
  { params }: { params: { surveyId: string } }
) {
  const user = await getCurrentUser()
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  const survey = await db.siteSurvey.findFirst({
    where: { id: params.surveyId, organizationId: user.organizationId },
    include: { _count: { select: { photos: true } } },
  })
  if (!survey) return NextResponse.json({ error: "Not found" }, { status: 404 })

  try {
    const formData = await request.formData()
    const files = formData.getAll("photos") as File[]

    if (!files.length) {
      return NextResponse.json({ error: "No photos provided" }, { status: 400 })
    }

    const created = []
    let order = survey._count.photos

    for (const file of files) {
      if (!ALLOWED_TYPES.includes(file.type)) {
        return NextResponse.json(
          { error: `Unsupported file type: ${file.type}. Use JPG, PNG, WebP or HEIC.` },
          { status: 400 }
        )
      }
      if (file.size > MAX_PHOTO_BYTES) {
        return NextResponse.json(
          { error: `${file.name} is over 15MB. Please use a smaller photo.` },
          { status: 400 }
        )
      }

      const url = await uploadPhotoWithMetadata(file, user.organizationId, survey.id)

      const photo = await db.surveyPhoto.create({
        data: {
          surveyId: survey.id,
          fileUrl: url,
          fileName: file.name,
          fileSize: file.size,
          order: order++,
        },
      })
      created.push(photo)
    }

    return NextResponse.json(created, { status: 201 })
  } catch (error) {
    console.error("Photo upload error:", error)
    return NextResponse.json({ error: "Photo upload failed" }, { status: 500 })
  }
}
