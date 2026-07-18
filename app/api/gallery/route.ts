import { NextRequest, NextResponse } from "next/server"
import { db } from "@/lib/db"
import { getCurrentUser } from "@/lib/session"
import { uploadFile } from "@/lib/storage"

const MAX_PHOTO_BYTES = 15 * 1024 * 1024
const ALLOWED_TYPES = ["image/jpeg", "image/png", "image/webp", "image/heic"]

export async function GET() {
  const user = await getCurrentUser()
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  const photos = await db.galleryPhoto.findMany({
    where: { organizationId: user.organizationId },
    orderBy: { createdAt: "desc" },
  })
  return NextResponse.json(photos)
}

export async function POST(request: NextRequest) {
  const user = await getCurrentUser()
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  try {
    const formData = await request.formData()
    const files = formData.getAll("photos") as File[]
    const tags = ((formData.get("tags") as string) || "").trim()

    if (!files.length) {
      return NextResponse.json({ error: "No photos provided" }, { status: 400 })
    }

    const created = []
    for (const file of files) {
      if (!ALLOWED_TYPES.includes(file.type)) {
        return NextResponse.json(
          { error: `Unsupported file type: ${file.type}` },
          { status: 400 }
        )
      }
      if (file.size > MAX_PHOTO_BYTES) {
        return NextResponse.json(
          { error: `${file.name} is over 15MB` },
          { status: 400 }
        )
      }
      const url = await uploadFile(
        file,
        `organizations/${user.organizationId}/gallery/${Date.now()}`
      )
      created.push(
        await db.galleryPhoto.create({
          data: {
            organizationId: user.organizationId,
            fileUrl: url,
            fileName: file.name,
            fileSize: file.size,
            tags: tags || null,
          },
        })
      )
    }
    return NextResponse.json(created, { status: 201 })
  } catch (error) {
    console.error("Gallery upload error:", error)
    return NextResponse.json({ error: "Upload failed" }, { status: 500 })
  }
}
