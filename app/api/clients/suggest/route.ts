import { NextRequest, NextResponse } from "next/server"
import { db } from "@/lib/db"
import { getCurrentUser } from "@/lib/session"

// Previous-client autocomplete for the new-survey form: matches the start of
// a client or company name across the org's surveys, newest first, deduped
// so each client appears once with their most recent details.
export async function GET(request: NextRequest) {
  const user = await getCurrentUser()
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  const q = (request.nextUrl.searchParams.get("q") || "").trim()
  if (q.length < 2) return NextResponse.json({ clients: [] })

  const surveys = await db.siteSurvey.findMany({
    where: {
      organizationId: user.organizationId,
      OR: [
        { clientName: { startsWith: q, mode: "insensitive" } },
        { clientCompany: { startsWith: q, mode: "insensitive" } },
      ],
    },
    orderBy: { updatedAt: "desc" },
    take: 30,
    select: {
      clientName: true,
      clientCompany: true,
      clientEmail: true,
      clientPhone: true,
      clientAddress: true,
      isResidential: true,
    },
  })

  // One entry per client (name + company), keeping the newest survey's details
  // but backfilling email/phone from older surveys where the newest lacks them.
  const byClient = new Map<string, (typeof surveys)[number]>()
  for (const s of surveys) {
    const key = `${s.clientName.toLowerCase()}|${(s.clientCompany || "").toLowerCase()}`
    const existing = byClient.get(key)
    if (!existing) {
      byClient.set(key, { ...s })
    } else {
      if (!existing.clientEmail && s.clientEmail) existing.clientEmail = s.clientEmail
      if (!existing.clientPhone && s.clientPhone) existing.clientPhone = s.clientPhone
    }
  }

  return NextResponse.json({ clients: [...byClient.values()].slice(0, 6) })
}
