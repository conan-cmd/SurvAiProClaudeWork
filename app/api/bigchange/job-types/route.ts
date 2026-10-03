import { NextResponse } from "next/server"
import { db } from "@/lib/db"
import { getCurrentUser } from "@/lib/session"
import { parseBigChangeConfig, listJobTypes } from "@/lib/bigchange"

// Job types from the connected BigChange account, so the right "survey" type
// can be picked in Settings. Also doubles as the connection test.
export async function GET() {
  const user = await getCurrentUser()
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  if (user.role !== "OWNER" && user.role !== "ADMIN") {
    return NextResponse.json({ error: "Only an owner or admin can manage BigChange" }, { status: 403 })
  }
  const org = await db.organization.findUnique({
    where: { id: user.organizationId },
    select: { bigchangeApiKey: true },
  })
  const cfg = parseBigChangeConfig(org?.bigchangeApiKey ?? null)
  if (!cfg) return NextResponse.json({ error: "BigChange isn't connected" }, { status: 409 })
  try {
    return NextResponse.json({ jobTypes: await listJobTypes(cfg) })
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "BigChange request failed" },
      { status: 502 }
    )
  }
}
