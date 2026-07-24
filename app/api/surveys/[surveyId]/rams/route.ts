import { NextRequest, NextResponse } from "next/server"
import OpenAI from "openai"
import { db } from "@/lib/db"
import { getCurrentUser } from "@/lib/session"
import { nearestHospital } from "@/lib/geo"

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
          content: `You draft professional Risk Assessments and Method Statements (RAMS) for UK exterior-cleaning and trade work, matching the structure a competent contractor would issue to a commercial client. Your output is a DRAFT to help the contractor think through hazards likely in this type of work — it is NOT exhaustive or a substitute for their own competent assessment; they must review it, remove anything that doesn't apply, and add site-specific hazards and controls. Use British English, be specific to the work type, practical and concise. Cover the hazards genuinely relevant to this activity (e.g. working at height, slips/trips from water and hoses, hot equipment/steam burns, public safety and exclusion zones, water runoff, manual handling, noise/vibration, electrical, fire, COSHH/chemicals) — but only those that actually apply.

Respond with JSON only, matching exactly this shape:
{
  "activity": string,                 // one-line activity, e.g. "External stone façade cleaning using DOFF steam system"
  "scopeOfWorks": string,             // the specific surfaces/areas covered
  "numOperatives": string,            // e.g. "2–4 trained operatives including a site supervisor"
  "descriptionOfWorks": string,       // 2-3 sentence narrative of the works, methods and public protection
  "responsibilities": [string],       // 3-5 lines: supervisor duties, operative duties, incident reporting
  "equipment": [string],              // equipment used on site
  "hazards": [{"hazard":string,"whoAtRisk":string,"controls":string,"ppe":string,"preP":number,"preS":number,"resP":number,"resS":number}],
  // Score every hazard: preP/preS = probability & severity BEFORE controls (1-5 each), resP/resS = residual probability & severity AFTER the controls are applied (1-5 each). Residual scores must be lower than or equal to pre-control. Risk ranking = P × S. Be realistic: working at height / fire may be pre-control 12-16, dropping to 3-4 residual with controls.
  "methodStatement": [{"title":string,"steps":[string]}],  // grouped into logical PHASES in order (e.g. "Site Assessment", "Site Setup", "Equipment Preparation", "Cleaning Operations", "Water & Waste Management", "Completion & Handover"); each phase has 2-5 short bullet steps
  "ppe": [string],                    // PPE items required — where they apply, use these exact labels so they match the app's PPE icons: "Safety boots", "Hi-vis clothing", "Protective gloves", "Eye protection / goggles", "Waterproof clothing", "Hard hat", "Ear protection", "Dust mask / RPE", "Harness & fall protection", "Face shield"
  "environmentalControls": [string],  // runoff, drains, chemical handling
  "emergencyProcedures": [string],    // stop-work, first aid, reporting, keeping access clear
  "coshh": [string],                  // COSHH / hazardous substances notes and asbestos/lead caveat
  "competency": [string]              // training/competencies operatives must hold
}`,
        },
        {
          role: "user",
          content: `Draft RAMS for this job. Provide 6-12 relevant hazards and a clear step-by-step method statement.
Service: ${survey.serviceType}
Title: ${survey.title}
Client type: ${survey.isResidential ? "residential" : "commercial"}
Client: ${survey.clientName}
Site address: ${survey.clientAddress}
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

    const asList = (v: unknown) => (Array.isArray(v) ? v.filter((x) => typeof x === "string" && x.trim()) : [])
    // Carry over anything the user typed themselves so a regenerate never wipes it.
    let prior: Record<string, unknown> = {}
    try { prior = survey.rams?.sections ? JSON.parse(survey.rams.sections) : {} } catch { prior = {} }

    // Auto-find the nearest hospital/A&E to the site for the emergency section.
    let hospital = typeof prior.nearestHospital === "string" ? prior.nearestHospital : ""
    if (!hospital && survey.latitude != null && survey.longitude != null) {
      const h = await nearestHospital(survey.latitude, survey.longitude)
      if (h) hospital = h.address ? `${h.name} — ${h.address}` : h.name
    }
    const sections = {
      activity: typeof data.activity === "string" ? data.activity : "",
      scopeOfWorks: typeof data.scopeOfWorks === "string" ? data.scopeOfWorks : "",
      numOperatives: typeof data.numOperatives === "string" ? data.numOperatives : "",
      siteSupervisor: typeof prior.siteSupervisor === "string" ? prior.siteSupervisor : "",
      emergencyContacts: typeof prior.emergencyContacts === "string" ? prior.emergencyContacts : "",
      nearestHospital: hospital,
      descriptionOfWorks: typeof data.descriptionOfWorks === "string" ? data.descriptionOfWorks : "",
      responsibilities: asList(data.responsibilities),
      equipment: asList(data.equipment),
      environmentalControls: asList(data.environmentalControls),
      emergencyProcedures: asList(data.emergencyProcedures),
      coshh: asList(data.coshh),
      competency: asList(data.competency),
      operatives: Array.isArray(prior.operatives) ? prior.operatives : [],
    }

    const payload = {
      hazards: Array.isArray(data.hazards) ? JSON.stringify(data.hazards) : null,
      methodStatement: Array.isArray(data.methodStatement) ? JSON.stringify(data.methodStatement) : null,
      ppe: Array.isArray(data.ppe) ? JSON.stringify(data.ppe) : null,
      siteInfo: typeof data.siteInfo === "string" ? data.siteInfo : null,
      sections: JSON.stringify(sections),
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
