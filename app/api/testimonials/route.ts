import { NextRequest, NextResponse } from "next/server"
import { z } from "zod"
import { db } from "@/lib/db"
import { getCurrentUser } from "@/lib/session"

export async function GET() {
  const user = await getCurrentUser()
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  const testimonials = await db.testimonial.findMany({
    where: { organizationId: user.organizationId },
    orderBy: { createdAt: "desc" },
  })
  return NextResponse.json(testimonials)
}

const createSchema = z
  .object({
    kind: z.enum(["review", "video"]),
    title: z.string().max(150).optional(),
    text: z.string().max(3000).optional(),
    author: z.string().max(100).optional(),
    rating: z.number().int().min(1).max(5).optional(),
    fileUrl: z.string().url().optional(),
    youtubeUrl: z.string().url().optional(),
    source: z.enum(["manual", "google"]).optional(),
    serviceTags: z.string().max(300).optional(),
    audience: z.enum(["ANY", "RESIDENTIAL", "COMMERCIAL"]).optional(),
  })
  .refine((d) => (d.kind === "review" ? !!d.text?.trim() : !!(d.fileUrl || d.youtubeUrl)), {
    message: "A written review needs text; a video needs an upload or YouTube link",
  })

export async function POST(request: NextRequest) {
  const user = await getCurrentUser()
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  const parsed = createSchema.safeParse(await request.json())
  if (!parsed.success) return NextResponse.json({ error: parsed.error.errors[0].message }, { status: 400 })

  const t = await db.testimonial.create({
    data: {
      organizationId: user.organizationId,
      kind: parsed.data.kind,
      title: parsed.data.title || null,
      text: parsed.data.text || null,
      author: parsed.data.author || null,
      rating: parsed.data.rating ?? null,
      fileUrl: parsed.data.fileUrl || null,
      youtubeUrl: parsed.data.youtubeUrl || null,
      source: parsed.data.source || "manual",
      serviceTags: parsed.data.serviceTags || null,
      audience: parsed.data.audience || "ANY",
    },
  })
  return NextResponse.json(t, { status: 201 })
}
