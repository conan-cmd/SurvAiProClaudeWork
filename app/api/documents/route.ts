import { NextRequest, NextResponse } from "next/server"
import { z } from "zod"
import { db } from "@/lib/db"
import { getCurrentUser } from "@/lib/session"

export async function GET() {
  const user = await getCurrentUser()
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  const documents = await db.orgDocument.findMany({
    where: { organizationId: user.organizationId },
    orderBy: { createdAt: "desc" },
  })
  return NextResponse.json(documents)
}

// Creates a document record from a file already streamed to Blob storage.
const schema = z.object({
  name: z.string().min(1).max(200),
  fileUrl: z.string().url(),
  fileType: z.string().max(120).optional(),
  fileSize: z.number().int().nonnegative().optional(),
})

export async function POST(request: NextRequest) {
  const user = await getCurrentUser()
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  const parsed = schema.safeParse(await request.json())
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.errors[0].message }, { status: 400 })
  }

  // Only accept Blob URLs scoped to this org's upload path.
  try {
    const u = new URL(parsed.data.fileUrl)
    if (
      !u.hostname.endsWith(".blob.vercel-storage.com") ||
      !u.pathname.includes(`organizations/${user.organizationId}/`)
    ) {
      return NextResponse.json({ error: "Invalid file URL" }, { status: 400 })
    }
  } catch {
    return NextResponse.json({ error: "Invalid file URL" }, { status: 400 })
  }

  const doc = await db.orgDocument.create({
    data: {
      organizationId: user.organizationId,
      name: parsed.data.name,
      fileUrl: parsed.data.fileUrl,
      fileType: parsed.data.fileType || null,
      fileSize: parsed.data.fileSize ?? 0,
    },
  })
  return NextResponse.json(doc, { status: 201 })
}
