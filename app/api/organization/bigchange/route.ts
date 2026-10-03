import { NextRequest, NextResponse } from "next/server"
import { z } from "zod"
import { db } from "@/lib/db"
import { getCurrentUser } from "@/lib/session"
import { parseBigChangeConfig, serializeBigChangeConfig } from "@/lib/bigchange"

// Connection status for the Settings card — never returns the secret.
export async function GET() {
  const user = await getCurrentUser()
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  const org = await db.organization.findUnique({
    where: { id: user.organizationId },
    select: { bigchangeApiKey: true },
  })
  const cfg = parseBigChangeConfig(org?.bigchangeApiKey ?? null)
  return NextResponse.json({
    connected: !!cfg,
    customerId: cfg?.customerId ?? null,
    jobTypeName: cfg?.jobTypeName ?? null,
  })
}

const saveSchema = z.object({
  clientId: z.string().trim().min(1).max(200).optional(),
  clientSecret: z.string().trim().min(1).max(200).optional(),
  customerId: z.string().trim().min(1).max(50).optional(),
  jobTypeId: z.number().int().optional(),
  jobTypeName: z.string().trim().max(120).optional(),
})

// Save credentials and/or the survey job-type choice (owner/admin only).
// Credentials are optional on update so the job type can change without
// re-entering the secret.
export async function POST(request: NextRequest) {
  const user = await getCurrentUser()
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  if (user.role !== "OWNER" && user.role !== "ADMIN") {
    return NextResponse.json({ error: "Only an owner or admin can connect BigChange" }, { status: 403 })
  }
  const parsed = saveSchema.safeParse(await request.json().catch(() => ({})))
  if (!parsed.success) return NextResponse.json({ error: "Invalid input" }, { status: 400 })
  const input = parsed.data

  const org = await db.organization.findUnique({
    where: { id: user.organizationId },
    select: { bigchangeApiKey: true },
  })
  const existing = parseBigChangeConfig(org?.bigchangeApiKey ?? null)

  const clientId = input.clientId || existing?.clientId
  const clientSecret = input.clientSecret || existing?.clientSecret
  const customerId = input.customerId || existing?.customerId
  if (!clientId || !clientSecret || !customerId) {
    return NextResponse.json(
      { error: "Client ID, Client Secret and Customer ID are all required" },
      { status: 400 }
    )
  }

  await db.organization.update({
    where: { id: user.organizationId },
    data: {
      bigchangeApiKey: serializeBigChangeConfig({
        clientId,
        clientSecret,
        customerId,
        jobTypeId: input.jobTypeId ?? existing?.jobTypeId,
        jobTypeName: input.jobTypeName ?? existing?.jobTypeName,
      }),
    },
  })
  return NextResponse.json({ success: true })
}

// Disconnect: drop the stored credentials (owner/admin only).
export async function DELETE() {
  const user = await getCurrentUser()
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  if (user.role !== "OWNER" && user.role !== "ADMIN") {
    return NextResponse.json({ error: "Only an owner or admin can disconnect BigChange" }, { status: 403 })
  }
  await db.organization.update({
    where: { id: user.organizationId },
    data: { bigchangeApiKey: null },
  })
  return NextResponse.json({ success: true })
}
