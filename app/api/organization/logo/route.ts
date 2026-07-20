import { NextRequest, NextResponse } from "next/server"
import { db } from "@/lib/db"
import { getCurrentUser } from "@/lib/session"
import { uploadFile } from "@/lib/storage"

const MAX_BYTES = 4 * 1024 * 1024
const ALLOWED_TYPES = ["image/jpeg", "image/png", "image/webp", "image/svg+xml"]

// Uploads org branding images: logo, headshot, or signature
const KINDS = {
  logo: "logoUrl",
  headshot: "headshotUrl",
  signature: "signatureImageUrl",
} as const

export async function POST(request: NextRequest) {
  const user = await getCurrentUser()
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  try {
    const formData = await request.formData()
    const file = (formData.get("logo") || formData.get("file")) as File | null
    const kind = ((formData.get("kind") as string) || "logo") as keyof typeof KINDS

    if (!KINDS[kind]) return NextResponse.json({ error: "Unknown image type" }, { status: 400 })
    if (!file) return NextResponse.json({ error: "No file provided" }, { status: 400 })
    if (!ALLOWED_TYPES.includes(file.type)) {
      return NextResponse.json({ error: "Use JPG, PNG, WebP or SVG" }, { status: 400 })
    }
    if (file.size > MAX_BYTES) {
      return NextResponse.json({ error: "Image must be under 4MB" }, { status: 400 })
    }

    const url = await uploadFile(file, `organizations/${user.organizationId}/${kind}-${user.id}`)

    // Logo belongs to the organisation; headshot/signature belong to the USER
    if (kind === "logo") {
      await db.organization.update({
        where: { id: user.organizationId },
        data: { logoUrl: url },
      })
    } else {
      await db.user.update({
        where: { id: user.id },
        data: { [KINDS[kind]]: url },
      })
    }

    return NextResponse.json({ url, logoUrl: kind === "logo" ? url : undefined })
  } catch (error) {
    console.error("Branding image upload error:", error)
    return NextResponse.json({ error: "Upload failed" }, { status: 500 })
  }
}
