import { NextRequest, NextResponse } from "next/server"
import { z } from "zod"
import { db } from "@/lib/db"
import { getCurrentUser } from "@/lib/session"
import { isApprover } from "@/lib/permissions"

const schema = z.object({ canSendProposals: z.boolean() })

// Owners/admins set whether a team member can send proposals directly, or must
// have them signed off first (draft-only).
export async function PATCH(
  request: NextRequest,
  { params }: { params: { userId: string } }
) {
  const user = await getCurrentUser()
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  if (!isApprover(user)) return NextResponse.json({ error: "Only owners and admins can change this." }, { status: 403 })

  const parsed = schema.safeParse(await request.json())
  if (!parsed.success) return NextResponse.json({ error: "Invalid request" }, { status: 400 })

  const target = await db.user.findFirst({
    where: { id: params.userId, organizationId: user.organizationId },
    select: { id: true, role: true },
  })
  if (!target) return NextResponse.json({ error: "Not found" }, { status: 404 })
  if (target.role === "OWNER") {
    return NextResponse.json({ error: "Owners can always send proposals." }, { status: 400 })
  }

  const updated = await db.user.update({
    where: { id: target.id },
    data: { canSendProposals: parsed.data.canSendProposals },
    select: { id: true, canSendProposals: true },
  })
  return NextResponse.json(updated)
}
