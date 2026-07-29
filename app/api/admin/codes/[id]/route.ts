import { NextRequest, NextResponse } from "next/server"
import { db } from "@/lib/db"
import { getCurrentUser } from "@/lib/session"
import { isPlatformAdmin } from "@/lib/admin"

// Revoke a code: deactivate it AND pull free access from every org it granted
// (they drop back to the paywall). "Cancel at any time."
export async function DELETE(
  _request: NextRequest,
  { params }: { params: { id: string } }
) {
  const user = await getCurrentUser()
  if (!isPlatformAdmin(user)) return NextResponse.json({ error: "Forbidden" }, { status: 403 })

  const code = await db.accessCode.findUnique({ where: { id: params.id } })
  if (!code) return NextResponse.json({ error: "Not found" }, { status: 404 })

  await db.$transaction([
    db.accessCode.update({ where: { id: code.id }, data: { active: false } }),
    db.organization.updateMany({
      where: { accessCodeId: code.id, freeAccess: true },
      data: { freeAccess: false },
    }),
  ])
  return NextResponse.json({ success: true })
}
