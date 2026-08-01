import { NextRequest, NextResponse } from "next/server"
import OpenAI from "openai"
import { db } from "@/lib/db"
import { getCurrentUser } from "@/lib/session"

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY })
export const maxDuration = 30

// Takes the free-form written description + any voice transcripts and splits them
// into the structured survey fields (measurements / exclusions / priorities /
// access), so the surveyor can "say it once" and let AI organise it.
export async function POST(
  _request: NextRequest,
  { params }: { params: { surveyId: string } }
) {
  const user = await getCurrentUser()
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  const survey = await db.siteSurvey.findFirst({
    where: { id: params.surveyId, organizationId: user.organizationId },
    include: { voiceNotes: { include: { transcript: true } } },
  })
  if (!survey) return NextResponse.json({ error: "Not found" }, { status: 404 })

  const transcripts = survey.voiceNotes.map((v) => v.transcript?.text).filter(Boolean).join("\n")
  const source = [survey.writtenDescription, transcripts].filter(Boolean).join("\n\n").trim()
  if (source.length < 15) {
    return NextResponse.json({ error: "Add a description (or voice note) first, then I can organise it." }, { status: 400 })
  }

  try {
    const response = await openai.chat.completions.create({
      model: "gpt-4o",
      messages: [
        {
          role: "system",
          content: `You organise a tradesperson's rough site-survey notes into structured fields for a proposal tool. Use ONLY what's in the notes — never invent. If something isn't mentioned, return an empty string for it. Keep each field concise and factual, in British English. Respond with JSON only: {"measurements": string, "exclusions": string, "clientPriorities": string, "accessNotes": string, "chemicalsRequired": string, "waterSupply": string, "writtenDescription": string}. "writtenDescription" = a tidied one-paragraph summary of the works; the others pull out the relevant specifics (sizes/areas; what's NOT included; what the client cares about; access/parking/welfare/hazards; "chemicalsRequired" = any cleaning chemicals/products mentioned e.g. sodium hypochlorite, biocide, softwash; "waterSupply" = on-site water availability e.g. outside tap, need a bowser, access/pressure).`,
        },
        {
          role: "user",
          content: `Service: ${survey.serviceType}\nProperty: ${survey.isResidential ? "residential" : "commercial"}\n\nNotes:\n${source.slice(0, 6000)}`,
        },
      ],
      response_format: { type: "json_object" },
      temperature: 0.2,
    })
    const d = JSON.parse(response.choices[0].message.content || "{}")
    const str = (v: unknown) => (typeof v === "string" ? v.trim() : "")

    const data: Record<string, string> = {}
    for (const f of ["measurements", "exclusions", "clientPriorities", "accessNotes", "chemicalsRequired", "waterSupply", "writtenDescription"] as const) {
      if (str(d[f])) data[f] = str(d[f])
    }
    if (Object.keys(data).length === 0) {
      return NextResponse.json({ error: "Couldn't pull structured details from those notes." }, { status: 422 })
    }

    await db.siteSurvey.update({ where: { id: survey.id }, data })
    return NextResponse.json(data)
  } catch (error) {
    console.error("Organise notes error:", error)
    const { friendlyAIError } = await import("@/lib/ai")
    return NextResponse.json({ error: friendlyAIError(error, "Couldn't organise the notes. Please try again.") }, { status: 500 })
  }
}
