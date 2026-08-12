import { NextRequest, NextResponse } from "next/server"
import { z } from "zod"
import { db } from "@/lib/db"
import { getCurrentUser } from "@/lib/session"
import { isApprover } from "@/lib/permissions"

const schema = z.object({
  canSendProposals: z.boolean().optional(),
  // CONTRACTOR = locked-down subcontractor (Job Reports only). OWNER can't be set here.
  role: z.enum(["MEMBER", "ADMIN", "CONTRACTOR"]).optional(),
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
  if (parsed.data.canSendProposals === undefined && parsed.data.role === undefined) {
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

  const updated = await db.user.update({
    where: { id: target.id },
    data,
    select: { id: true, role: true, canSendProposals: true },
  })
  return NextResponse.json(updated)
}
