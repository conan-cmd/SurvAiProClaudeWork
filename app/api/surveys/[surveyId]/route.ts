import { NextRequest, NextResponse } from "next/server"
import { db } from "@/lib/db"
import { getCurrentUser } from "@/lib/session"

// Every handler verifies the survey belongs to the caller's organization.
async function getScopedSurvey(surveyId: string, organizationId: string) {
  return db.siteSurvey.findFirst({
    where: { id: surveyId, organizationId },
  })
}

export async function GET(
  _request: NextRequest,
  { params }: { params: { surveyId: string } }
) {
  const user = await getCurrentUser()
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  const survey = await db.siteSurvey.findFirst({
    where: { id: params.surveyId, organizationId: user.organizationId },
    include: {
      photos: { orderBy: { order: "asc" } },
      voiceNotes: { include: { transcript: true } },
      proposal: { select: { id: true, status: true } },
    },
  })

  if (!survey) return NextResponse.json({ error: "Not found" }, { status: 404 })
  return NextResponse.json(survey)
}

export async function PATCH(
  request: NextRequest,
  { params }: { params: { surveyId: string } }
) {
  const user = await getCurrentUser()
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  const existing = await getScopedSurvey(params.surveyId, user.organizationId)
  if (!existing) return NextResponse.json({ error: "Not found" }, { status: 404 })

  try {
    const body = await request.json()
    // Autosave sends partial updates; only allow known scalar fields through.
    const allowed = [
      "clientName", "clientCompany", "clientEmail", "clientPhone", "clientAddress",
      "title", "serviceType", "isResidential", "clientPriorities", "accessNotes",
      "measurements", "exclusions", "writtenDescription", "status",
    ]
    const data: Record<string, unknown> = {}
    for (const key of allowed) {
      if (key in body) data[key] = body[key]
    }

    const survey = await db.siteSurvey.update({
      where: { id: params.surveyId },
      data,
    })

    return NextResponse.json(survey)
  } catch (error) {
    console.error("Survey update error:", error)
    return NextResponse.json({ error: "Failed to update survey" }, { status: 500 })
  }
}

export async function DELETE(
  _request: NextRequest,
  { params }: { params: { surveyId: string } }
) {
  const user = await getCurrentUser()
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  const existing = await getScopedSurvey(params.surveyId, user.organizationId)
  if (!existing) return NextResponse.json({ error: "Not found" }, { status: 404 })

  await db.siteSurvey.delete({ where: { id: params.surveyId } })
  return NextResponse.json({ success: true })
}
