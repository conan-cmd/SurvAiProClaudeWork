import { NextRequest, NextResponse } from "next/server"
import { z } from "zod"
import { db } from "@/lib/db"
import { getCurrentUser } from "@/lib/session"
import { isApprover } from "@/lib/permissions"
import { SECTION_KEYS } from "@/lib/nav-sections"

const schema = z.object({
  canSendProposals: z.boolean().optional(),
  // CONTRACTOR = locked-down subcontractor (Job Reports only). OWNER can't be set here.
  role: z.enum(["MEMBER", "ADMIN", "CONTRACTOR"]).optional(),
  // Nav sections this user sees (stored as JSON; unknown keys dropped).
  navSections: z.array(z.string()).optional(),
})

// Owners/admins set a member's role and whether they can send proposals directly.
export async function PATCH(
  request: NextRequest,
  { params }: { params: { userId: string } }
) {
  const user = await getCurrentUser()
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  if (!isApprover(user)) return NextResponse.json({ error: "Only owners and admins can change this." }, { status: 403 })

  const parsed = schema.safeParse(await request.json())
  if (!parsed.success) return NextResponse.json({ error: "Invalid request" }, { status: 400 })
  if (parsed.data.canSendProposals === undefined && parsed.data.role === undefined && parsed.data.navSections === undefined) {
    return NextResponse.json({ error: "Nothing to update" }, { status: 400 })
  }

  const target = await db.user.findFirst({
    where: { id: params.userId, organizationId: user.organizationId },
    select: { id: true, role: true },
  })
  if (!target) return NextResponse.json({ error: "Not found" }, { status: 404 })
  if (target.role === "OWNER") {
    return NextResponse.json({ error: "You can't change the owner's role." }, { status: 400 })
  }

  const data: Record<string, unknown> = {}
  if (parsed.data.canSendProposals !== undefined) data.canSendProposals = parsed.data.canSendProposals
  if (parsed.data.role !== undefined) data.role = parsed.data.role
  if (parsed.data.navSections !== undefined) {
    data.navSections = JSON.stringify(SECTION_KEYS.filter((k) => parsed.data.navSections!.includes(k)))
  }

  const updated = await db.user.update({
    where: { id: target.id },
    data,
    select: { id: true, role: true, canSendProposals: true, navSections: true },
  })
  return NextResponse.json(updated)
}

// Owners/admins remove someone from the team. Their surveys, proposals, RAMS and
// job reports stay with the organisation (the creator link is cleared by the
// schema's onDelete: SetNull) — only the login goes. Only the owner can remove
// an admin; nobody can remove the owner or themselves.
export async function DELETE(
  _request: NextRequest,
  { params }: { params: { userId: string } }
) {
  const user = await getCurrentUser()
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  if (!isApprover(user)) return NextResponse.json({ error: "Only owners and admins can remove team members." }, { status: 403 })
  if (params.userId === user.id) return NextResponse.json({ error: "You can't remove yourself." }, { status: 400 })

  const target = await db.user.findFirst({
    where: { id: params.userId, organizationId: user.organizationId },
    select: { id: true, role: true },
  })
  if (!target) return NextResponse.json({ error: "Not found" }, { status: 404 })
  if (target.role === "OWNER") return NextResponse.json({ error: "The owner can't be removed." }, { status: 400 })
  if (target.role === "ADMIN" && user.role !== "OWNER") {
    return NextResponse.json({ error: "Only the owner can remove an admin." }, { status: 403 })
  }

  // Proposals signed off in their name fall back to the org identity
  // (resolveProposalIdentity handles a missing user).
  await db.user.delete({ where: { id: target.id } })
  return NextResponse.json({ removed: true })
}
