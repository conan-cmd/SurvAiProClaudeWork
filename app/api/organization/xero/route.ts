import { NextResponse } from "next/server"
import { db } from "@/lib/db"
import { getCurrentUser } from "@/lib/session"
import { xeroAvailable, xeroConnected } from "@/lib/xero"

// Connection status for the Settings card.
export async function GET() {
  const user = await getCurrentUser()
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  const org = await db.organization.findUnique({
    where: { id: user.organizationId },
    select: { xeroRefreshToken: true, xeroTenantId: true, xeroTenantName: true },
  })
  return NextResponse.json({
    available: xeroAvailable(),
    connected: !!org && xeroConnected(org),
    tenantName: org?.xeroTenantName || null,
  })
}

// Disconnect: drop the stored tokens (owner/admin only).
export async function DELETE() {
  const user = await getCurrentUser()
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  if (user.role !== "OWNER" && user.role !== "ADMIN") {
    return NextResponse.json({ error: "Only an owner or admin can disconnect Xero" }, { status: 403 })
  }
  await db.organization.update({
    where: { id: user.organizationId },
    data: {
      xeroAccessToken: null,
      xeroRefreshToken: null,
      xeroTokenExpiresAt: null,
      xeroTenantId: null,
      xeroTenantName: null,
    },
  })
  return NextResponse.json({ success: true })
}
