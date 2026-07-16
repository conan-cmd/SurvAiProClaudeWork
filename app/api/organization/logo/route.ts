import { NextRequest, NextResponse } from "next/server"
import { db } from "@/lib/db"
import { getCurrentUser } from "@/lib/session"
import { uploadFile } from "@/lib/storage"

const MAX_LOGO_BYTES = 4 * 1024 * 1024
const ALLOWED_TYPES = ["image/jpeg", "image/png", "image/webp", "image/svg+xml"]

export async function POST(request: NextRequest) {
  const user = await getCurrentUser()
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  try {
    const formData = await request.formData()
    const file = formData.get("logo") as File | null

    if (!file) return NextResponse.json({ error: "No file provided" }, { status: 400 })
    if (!ALLOWED_TYPES.includes(file.type)) {
      return NextResponse.json({ error: "Use JPG, PNG, WebP or SVG" }, { status: 400 })
    }
    if (file.size > MAX_LOGO_BYTES) {
      return NextResponse.json({ error: "Logo must be under 4MB" }, { status: 400 })
    }

    const url = await uploadFile(file, `organizations/${user.organizationId}/logo`)

    const org = await db.organization.update({
      where: { id: user.organizationId },
      data: { logoUrl: url },
    })

    return NextResponse.json({ logoUrl: org.logoUrl })
  } catch (error) {
    console.error("Logo upload error:", error)
    return NextResponse.json({ error: "Logo upload failed" }, { status: 500 })
  }
}
