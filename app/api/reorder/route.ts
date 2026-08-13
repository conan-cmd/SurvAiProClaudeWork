import { NextRequest, NextResponse } from "next/server"
import { z } from "zod"
import { db } from "@/lib/db"
import { getCurrentUser } from "@/lib/session"

const schema = z.object({
  kind: z.enum(["survey", "proposal", "rams"]),
  draggedId: z.string().min(1),
  // The row the dragged item was dropped on — it takes that position.
  beforeId: z.string().min(1),
})

// Drag-to-reorder for the surveys / proposals / RAMS lists. Reorders the org's
// full list (filtered views preserve relative order): remove the dragged item,
// insert it before the drop target, renumber sortIndex for everything.
export async function POST(request: NextRequest) {
  const user = await getCurrentUser()
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  const parsed = schema.safeParse(await request.json())
  if (!parsed.success) return NextResponse.json({ error: "Invalid request" }, { status: 400 })
  const { kind, draggedId, beforeId } = parsed.data
  if (draggedId === beforeId) return NextResponse.json({ success: true })

  // Same ordering the list pages use: manual position first, newest first for
  // anything not yet manually placed.
  const orderBy = [
    { sortIndex: { sort: "asc", nulls: "first" } },
    { updatedAt: "desc" },
  ] as never
  const where = { organizationId: user.organizationId }

  const rows =
    kind === "survey"
      ? await db.siteSurvey.findMany({ where, orderBy, select: { id: true } })
      : kind === "proposal"
        ? await db.proposal.findMany({ where, orderBy, select: { id: true } })
        : await db.rams.findMany({ where, orderBy, select: { id: true } })

  const ids = rows.map((r) => r.id)
  if (!ids.includes(draggedId) || !ids.includes(beforeId)) {
    return NextResponse.json({ error: "Not found" }, { status: 404 })
  }

  const without = ids.filter((id) => id !== draggedId)
  without.splice(without.indexOf(beforeId), 0, draggedId)

  // Renumber in one raw statement: only sortIndex changes — going through the
  // Prisma client would bump @updatedAt on every row, making a reorder look
  // like everything was edited today. Table name comes from a fixed map.
  const table = kind === "survey" ? "SiteSurvey" : kind === "proposal" ? "Proposal" : "Rams"
  await db.$executeRawUnsafe(
    `UPDATE "${table}" AS t SET "sortIndex" = v.ord * 10
     FROM (SELECT u.id, u.ord FROM unnest($1::text[]) WITH ORDINALITY AS u(id, ord)) v
     WHERE t.id = v.id AND t."organizationId" = $2`,
    without,
    user.organizationId
  )
  return NextResponse.json({ success: true })
}
