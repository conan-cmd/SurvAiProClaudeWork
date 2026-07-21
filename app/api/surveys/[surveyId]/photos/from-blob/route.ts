import { NextRequest, NextResponse } from "next/server"
import { z } from "zod"
import { db } from "@/lib/db"
import { getCurrentUser } from "@/lib/session"

// Creates photo records from files the browser has already streamed straight to
// Blob storage (bypassing the 4.5MB serverless body cap). Companion to the
// classic multipart POST in ../route.ts, used by the fast upload path.
const schema = z.object({
  photos: z
    .array(
      z.object({
        url: z.string().url(),
        fileName: z.string().max(255),
        fileSize: z.number().int().nonnegative().optional(),
      })
    )
    .min(1)
    .max(50),
})

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

  const parsed = schema.safeParse(await request.json())
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.errors[0].message }, { status: 400 })
  }

  // Only accept Blob URLs scoped to this org's upload path - a signed-in user
  // must not be able to point photo records at arbitrary URLs.
  const orgPrefix = `organizations/${user.organizationId}/`
  const valid = parsed.data.photos.filter((p) => {
    try {
      const u = new URL(p.url)
      return (
        u.hostname.endsWith(".blob.vercel-storage.com") &&
        u.pathname.includes(orgPrefix)
      )
    } catch {
      return false
    }
  })
  if (!valid.length) {
    return NextResponse.json({ error: "No valid photo URLs" }, { status: 400 })
  }

  let order = survey._count.photos
  const created = []
  for (const p of valid) {
    const photo = await db.surveyPhoto.create({
      data: {
        surveyId: survey.id,
        fileUrl: p.url,
        fileName: p.fileName,
        fileSize: p.fileSize ?? 0,
        order: order++,
      },
    })
    created.push(photo)
  }

  return NextResponse.json(created, { status: 201 })
}
