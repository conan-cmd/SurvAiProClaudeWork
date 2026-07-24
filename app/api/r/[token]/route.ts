import { NextRequest, NextResponse } from "next/server"
import { db } from "@/lib/db"

function parse<T>(s: string | null, fallback: T): T {
  try { return s ? (JSON.parse(s) as T) : fallback } catch { return fallback }
}

// Public (no-login) read of a RAMS via its share token. Returns only what an
// operative needs to review and sign — no internal ids or org data beyond branding.
export async function GET(
  _request: NextRequest,
  { params }: { params: { token: string } }
) {
  const rams = await db.rams.findUnique({
    where: { publicToken: params.token },
    include: {
      survey: { select: { title: true, clientName: true, clientAddress: true, serviceType: true } },
      organization: { select: { name: true, logoUrl: true, brandColor: true, phone: true, email: true } },
    },
  })
  if (!rams) return NextResponse.json({ error: "This link is no longer valid" }, { status: 404 })

  const sections = parse<Record<string, unknown>>(rams.sections, {})
  const operatives = (Array.isArray(sections.operatives) ? sections.operatives : []) as {
    id?: string; name: string; phone?: string; email?: string; signedAt?: string
  }[]

  return NextResponse.json({
    title: rams.survey.title,
    survey: rams.survey,
    organization: rams.organization,
    sections,
    hazards: parse(rams.hazards, []),
    methodStatement: parse(rams.methodStatement, []),
    ppe: parse(rams.ppe, []),
    siteInfo: rams.siteInfo || "",
    // Signed status only — never expose other people's signature images publicly.
    operatives: operatives.map((o, i) => ({
      id: o.id || String(i),
      name: o.name,
      signedAt: o.signedAt || null,
    })),
  })
}
