import { NextResponse } from "next/server"
import { getCurrentUser } from "@/lib/session"

// Presence heartbeat — getCurrentUser stamps lastActiveAt (throttled), so
// there's nothing else to do here.
export async function POST() {
  const user = await getCurrentUser()
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  return NextResponse.json({ ok: true })
}
