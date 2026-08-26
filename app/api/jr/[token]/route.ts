import { NextRequest, NextResponse } from "next/server"
import { db } from "@/lib/db"

// Public, read-only view of a completed job report (via its share token).
export async function GET(_request: NextRequest, { params }: { params: { token: string } }) {
  const report = await db.jobReport.findUnique({
    where: { publicToken: params.token },
    include: {
      site: true,
      photos: { orderBy: { order: "asc" } },
      organization: { select: { name: true, logoUrl: true, brandColor: true, secondaryColor: true, phone: true, email: true, website: true } },
    },
  })
  if (!report || report.status !== "COMPLETED") {
    return NextResponse.json({ error: "Not found" }, { status: 404 })
  }

  let fields: Record<string, string> = {}
  try {
    fields = report.fields ? JSON.parse(report.fields) : {}
  } catch {
    fields = {}
  }

  return NextResponse.json({
    id: report.id,
    status: report.status,
    visitDate: report.visitDate,
    fields,
    technicianName: report.technicianName,
    signatureImage: report.signatureImage,
    signedAt: report.signedAt,
    completedAt: report.completedAt,
    site: {
      clientName: report.site.clientName,
      clientCompany: report.site.clientCompany,
      address: report.site.address,
    },
    photos: report.photos.map((p) => ({ id: p.id, fileUrl: p.fileUrl, caption: p.caption })),
    organization: report.organization,
  })
}
