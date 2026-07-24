import { NextRequest, NextResponse } from "next/server"
import { randomBytes } from "crypto"
import { z } from "zod"
import { db } from "@/lib/db"

type Operative = {
  id?: string; name: string; phone?: string; email?: string
  signatureImage?: string; signedAt?: string
}

const signSchema = z.object({
  // Existing operative to sign as, or blank to add yourself to the list.
  operativeId: z.string().optional(),
  name: z.string().min(2, "Please enter your full name"),
  signature: z.string().startsWith("data:image/").max(500_000),
})

// Public endpoint: an operative signs the RAMS via the share link. Writes the
// signature straight back onto the master RAMS so the app shows who has signed.
export async function POST(
  request: NextRequest,
  { params }: { params: { token: string } }
) {
  const rams = await db.rams.findUnique({
    where: { publicToken: params.token },
    select: { id: true, sections: true },
  })
  if (!rams) return NextResponse.json({ error: "This link is no longer valid" }, { status: 404 })

  const parsed = signSchema.safeParse(await request.json())
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.errors[0].message }, { status: 400 })
  }

  let sections: Record<string, unknown> = {}
  try { sections = rams.sections ? JSON.parse(rams.sections) : {} } catch { sections = {} }
  const operatives: Operative[] = Array.isArray(sections.operatives) ? sections.operatives : []

  const now = new Date().toISOString()
  const { operativeId, name, signature } = parsed.data

  // Match by id (or the index fallback the public GET hands out) — else add new.
  const idx = operativeId
    ? operatives.findIndex((o, i) => (o.id || String(i)) === operativeId)
    : -1

  if (idx >= 0) {
    if (operatives[idx].signedAt) {
      return NextResponse.json({ error: "This person has already signed" }, { status: 409 })
    }
    operatives[idx] = { ...operatives[idx], name, signatureImage: signature, signedAt: now }
  } else {
    operatives.push({
      id: randomBytes(6).toString("hex"),
      name, phone: "", email: "",
      signatureImage: signature, signedAt: now,
    })
  }

  sections.operatives = operatives
  await db.rams.update({ where: { id: rams.id }, data: { sections: JSON.stringify(sections) } })

  return NextResponse.json({ success: true })
}
