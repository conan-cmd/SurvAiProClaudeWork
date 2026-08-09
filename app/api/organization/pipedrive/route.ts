import { NextRequest, NextResponse } from "next/server"
import { z } from "zod"
import { db } from "@/lib/db"
import { getCurrentUser } from "@/lib/session"
import { encryptSecret } from "@/lib/crypto"
import { pipedriveTest, oauthAvailable } from "@/lib/pipedrive"

// Connection status (never returns any token).
export async function GET() {
  const user = await getCurrentUser()
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  const org = await db.organization.findUnique({
    where: { id: user.organizationId },
    select: {
      pipedriveApiToken: true, pipedriveCompanyDomain: true,
      pipedriveAccessToken: true, pipedriveApiDomain: true,
    },
  })
  const oauthConnected = Boolean(org?.pipedriveAccessToken && org?.pipedriveApiDomain)
  const tokenConnected = Boolean(org?.pipedriveApiToken && org?.pipedriveCompanyDomain)
  return NextResponse.json({
    connected: oauthConnected || tokenConnected,
    // "oauth" (one-click install) vs "token" (self-connect) — informs the UI.
    mode: oauthConnected ? "oauth" : tokenConnected ? "token" : null,
    oauthAvailable: oauthAvailable(),
    companyDomain: org?.pipedriveCompanyDomain || null,
    apiDomain: org?.pipedriveApiDomain || null,
  })
}

const schema = z.object({
  apiToken: z.string().min(5, "Enter your Pipedrive API token"),
  // Accept a full URL or bare subdomain and normalise to just the subdomain.
  companyDomain: z.string().min(1, "Enter your Pipedrive company domain"),
})

// Only owners/admins manage the CRM connection.
export async function POST(request: NextRequest) {
  const user = await getCurrentUser()
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  if (user.role !== "OWNER" && user.role !== "ADMIN") {
    return NextResponse.json({ error: "Only an owner or admin can connect Pipedrive." }, { status: 403 })
  }

  const parsed = schema.safeParse(await request.json())
  if (!parsed.success) return NextResponse.json({ error: parsed.error.errors[0].message }, { status: 400 })

  // Normalise "https://acme.pipedrive.com" or "acme.pipedrive.com" → "acme".
  const domain = parsed.data.companyDomain
    .trim()
    .replace(/^https?:\/\//, "")
    .replace(/\.pipedrive\.com.*$/i, "")
    .replace(/\/.*$/, "")
  const token = parsed.data.apiToken.trim()

  try {
    const { name } = await pipedriveTest(token, domain)
    await db.organization.update({
      where: { id: user.organizationId },
      data: { pipedriveApiToken: encryptSecret(token), pipedriveCompanyDomain: domain },
    })
    return NextResponse.json({ connected: true, companyDomain: domain, userName: name })
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Couldn't connect to Pipedrive." },
      { status: 400 }
    )
  }
}

export async function DELETE() {
  const user = await getCurrentUser()
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  if (user.role !== "OWNER" && user.role !== "ADMIN") {
    return NextResponse.json({ error: "Only an owner or admin can disconnect Pipedrive." }, { status: 403 })
  }
  await db.organization.update({
    where: { id: user.organizationId },
    data: {
      pipedriveApiToken: null, pipedriveCompanyDomain: null,
      pipedriveAccessToken: null, pipedriveRefreshToken: null,
      pipedriveTokenExpiresAt: null, pipedriveApiDomain: null, pipedriveCompanyId: null,
    },
  })
  return NextResponse.json({ connected: false })
}
