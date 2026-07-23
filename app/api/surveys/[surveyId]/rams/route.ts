import { NextRequest, NextResponse } from "next/server"
import OpenAI from "openai"
import { db } from "@/lib/db"
import { getCurrentUser } from "@/lib/session"

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY })

export const maxDuration = 60

// GET: the survey's RAMS id (or null) so the UI can link/create.
export async function GET(
  _request: NextRequest,
  { params }: { params: { surveyId: string } }
) {
  const user = await getCurrentUser()
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  const survey = await db.siteSurvey.findFirst({
    where: { id: params.surveyId, organizationId: user.organizationId },
    select: { rams: { select: { id: true } } },
  })
  if (!survey) return NextResponse.json({ error: "Not found" }, { status: 404 })
  return NextResponse.json({ ramsId: survey.rams?.id ?? null })
}

// POST: AI-draft a RAMS from the survey. Draft only — the user must review.
export async function POST(
  _request: NextRequest,
  { params }: { params: { surveyId: string } }
) {
  const user = await getCurrentUser()
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  const survey = await db.siteSurvey.findFirst({
    where: { id: params.surveyId, organizationId: user.organizationId },
    include: { rams: true },
  })
  if (!survey) return NextResponse.json({ error: "Not found" }, { status: 404 })

  try {
    const start = Date.now()
    const response = await openai.chat.completions.create({
      model: "gpt-4o",
      messages: [
        {
          role: "system",
          content: `You draft Risk Assessments and Method Statements (RAMS) for UK trade/service work. Your output is a DRAFT to help the contractor think through hazards likely in this type of work — it is NOT exhaustive or a substitute for their own competent assessment; they must review it and add site-specific hazards and controls. British English, specific to the work type, practical and concise. Respond with JSON only: {"hazards":[{"hazard":string,"whoAtRisk":string,"controls":string,"ppe":string}],"methodStatement":[string steps in logical order],"ppe":[string items],"siteInfo":string}.`,
        },
        {
          role: "user",
          content: `Draft RAMS for this job. Provide 6-12 relevant hazards and a clear step-by-step method statement (setup → works → completion → site handover).
Service: ${survey.serviceType}
Title: ${survey.title}
Client type: ${survey.isResidential ? "residential" : "commercial"}
Description: ${survey.writtenDescription || "n/a"}
Access notes: ${survey.accessNotes || "n/a"}
Measurements: ${survey.measurements || "n/a"}`,
        },
      ],
      response_format: { type: "json_object" },
      temperature: 0.4,
    })
    const data = JSON.parse(response.choices[0].message.content || "{}")
    const genMs = Date.now() - start

    const payload = {
      hazards: Array.isArray(data.hazards) ? JSON.stringify(data.hazards) : null,
      methodStatement: Array.isArray(data.methodStatement) ? JSON.stringify(data.methodStatement) : null,
      ppe: Array.isArray(data.ppe) ? JSON.stringify(data.ppe) : null,
      siteInfo: typeof data.siteInfo === "string" ? data.siteInfo : null,
      generationMs: genMs,
    }

    const rams = survey.rams
      ? await db.rams.update({ where: { id: survey.rams.id }, data: payload })
      : await db.rams.create({
          data: {
            ...payload,
            surveyId: survey.id,
            organizationId: user.organizationId,
            createdById: user.id,
          },
        })

    return NextResponse.json({ id: rams.id }, { status: 201 })
  } catch (error) {
    console.error("RAMS generation error:", error)
    const { friendlyAIError } = await import("@/lib/ai")
    return NextResponse.json(
      { error: friendlyAIError(error, "Failed to draft the RAMS. Please try again.") },
      { status: 500 }
    )
  }
}
