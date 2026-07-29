import { NextRequest, NextResponse } from "next/server"
import { randomBytes } from "crypto"
import { z } from "zod"
import { db } from "@/lib/db"
import { getCurrentUser } from "@/lib/session"
import { isPlatformAdmin } from "@/lib/admin"

// Readable code, e.g. SURV-7QX3K9
function makeCode() {
  const alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"
  const bytes = randomBytes(6)
  let s = ""
  for (let i = 0; i < 6; i++) s += alphabet[bytes[i] % alphabet.length]
  return `SURV-${s}`
}

export async function GET() {
  const user = await getCurrentUser()
  if (!isPlatformAdmin(user)) return NextResponse.json({ error: "Forbidden" }, { status: 403 })

  const codes = await db.accessCode.findMany({ orderBy: { createdAt: "desc" } })
  // How many orgs each code currently grants access to.
  const grants = await db.organization.groupBy({
    by: ["accessCodeId"],
    where: { freeAccess: true, accessCodeId: { not: null } },
    _count: true,
  })
  const byCode = new Map(grants.map((g) => [g.accessCodeId, g._count]))
  return NextResponse.json(
    codes.map((c) => ({ ...c, activeGrants: byCode.get(c.id) || 0 }))
  )
}

const createSchema = z.object({
  label: z.string().max(120).optional(),
  maxUses: z.number().int().min(1).max(1000).optional(),
})

export async function POST(request: NextRequest) {
  const user = await getCurrentUser()
  if (!isPlatformAdmin(user)) return NextResponse.json({ error: "Forbidden" }, { status: 403 })

  const parsed = createSchema.safeParse(await request.json().catch(() => ({})))
  if (!parsed.success) return NextResponse.json({ error: "Invalid" }, { status: 400 })

  // Retry a couple of times in the unlikely event of a code collision.
  let code = ""
  for (let i = 0; i < 5; i++) {
    code = makeCode()
    const exists = await db.accessCode.findUnique({ where: { code } })
    if (!exists) break
  }

  const created = await db.accessCode.create({
    data: { code, label: parsed.data.label || null, maxUses: parsed.data.maxUses || 1 },
  })
  return NextResponse.json(created, { status: 201 })
}
