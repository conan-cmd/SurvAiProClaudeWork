import { NextRequest, NextResponse } from "next/server"
import { z } from "zod"
import { getCurrentUser } from "@/lib/session"
import { executeActions, PlannedAction } from "@/lib/assistant"

export const maxDuration = 120

const schema = z.object({
  actions: z
    .array(
      z.object({
        tool: z.enum(["update_pricing", "send_proposal", "send_nudge", "set_status"]),
        args: z.record(z.unknown()),
        summary: z.string().max(500),
      })
    )
    .min(1)
    .max(25),
})

// Runs a confirmed plan. Every action re-validates org scope and permissions
// server-side — the client only ever echoes back what planning produced.
export async function POST(request: NextRequest) {
  const user = await getCurrentUser()
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  const parsed = schema.safeParse(await request.json().catch(() => ({})))
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid actions" }, { status: 400 })
  }

  const results = await executeActions(
    user,
    parsed.data.actions as PlannedAction[],
    request.nextUrl.origin
  )
  return NextResponse.json({ results })
}
