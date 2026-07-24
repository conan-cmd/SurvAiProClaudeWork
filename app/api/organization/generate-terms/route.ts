import { NextResponse } from "next/server"
import OpenAI from "openai"
import { db } from "@/lib/db"
import { getCurrentUser } from "@/lib/session"

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY })

export const maxDuration = 60

// Drafts a generic set of UK trades/services T&Cs for the org to review.
// Returned as a DRAFT only - the user must review and save it themselves.
export async function POST(request: Request) {
  const user = await getCurrentUser()
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  const body = await request.json().catch(() => ({}))
  const type: "residential" | "commercial" =
    body?.type === "commercial" ? "commercial" : "residential"

  const org = await db.organization.findUniqueOrThrow({
    where: { id: user.organizationId },
  })
  const services = org.mainServices ? JSON.parse(org.mainServices).join(", ") : "trade services"

  const typeGuidance =
    type === "commercial"
      ? "These terms are for COMMERCIAL clients (property managers, facilities management, main contractors, developers). Include: presumption of free access to safe scaffolding/access equipment where quoted by others; scaffold sheeting where elevation cleaning is quoted; welfare facilities, storage, skips, waste disposal and parking provided by the client/main contractor; parking dispensations arranged by the client; 7-day valuations with 14-day payment for longer projects; retention deemed 0% due to quality management systems; right to claim additional preliminaries if scope increases; site sign-off by an authorised person each day. OMIT consumer cooling-off rights - these are B2B terms."
      : "These terms are for RESIDENTIAL consumer clients. Include the 14-day cooling-off right under the Consumer Contracts Regulations 2013 for off-premises contracts, and a statement that statutory rights are unaffected. Keep language homeowner-friendly."

  try {
    const response = await openai.chat.completions.create({
      model: "gpt-4o",
      messages: [
        {
          role: "system",
          content: `You draft proposal terms and conditions for UK trades and service businesses. Plain English, one term per line (no numbering, no headings), British English.

Most importantly, TAILOR the terms to the SPECIFIC trade(s) the business provides — include the clauses a competent firm in THAT trade would carry, and leave out ones that don't apply. Examples of trade-specific clauses:
- Roofing / roof repairs / re-roofing: working at height and scaffold/access; tile & slate matching cannot be guaranteed for discontinued/weathered types; pre-existing defects in felt/underlay, battens, flashings, chimneys or structural timber excluded unless quoted; weather-tightness guaranteed only where re-covering is quoted; workmanship guarantee period.
- Roof / render / exterior cleaning & softwashing: risk to already-defective, lifting or previously-painted coatings; efflorescence and natural colour variation; surfaces cleaned to the best achievable result, not "as new"; moss/algae removal may expose existing damage; runoff and protection of adjacent surfaces/planting.
- Gutter / hopper clearance: work limited to accessible outlets; blockages within downpipes or underground drains excluded; existing leaks or joint failures reported, not repaired, unless quoted.
- Window cleaning: pre-existing scratches or hard-water staining not removable; frames/sills cleaned only where quoted.
- Driveway / patio / paving: jointing sand replacement, weed regrowth over time, and natural colour variation; sealant results depend on surface condition.
Only include the ones relevant to the listed services, and invent sensible equivalents for any other trade.

Always also cover the commercial/legal base: quotation validity; one continuous site visit assumption with a demobilisation fee for interruptions caused by others; client-provided access, water and electricity; welfare/storage/waste/parking responsibilities; local-authority permissions by others; re-pricing where site conditions differ from the survey; weather delays; pre-existing defects not our liability; deposit and payment terms (payment due within 14 days of completion; interest on overdue invoices at 8% over Bank of England base rate per the Late Payment of Commercial Debts Act); title to materials until paid; variations agreed in writing; defects notified promptly with opportunity to remedy; insurance held; consumer 14-day cooling-off under the Consumer Contracts Regulations where applicable; governing law England and Wales. End with a line advising this is a general template and the business should have its terms reviewed professionally.`,
        },
        {
          role: "user",
          content: `Draft 15-20 concise terms for ${org.name}, whose services are: ${services} (UK). Prioritise clauses specific to those services, then the standard commercial/legal terms. ${typeGuidance}`,
        },
      ],
      temperature: 0.4,
      max_tokens: 1200,
    })

    return NextResponse.json({ terms: response.choices[0].message.content || "" })
  } catch (error) {
    console.error("Terms generation error:", error)
    const { friendlyAIError } = await import("@/lib/ai")
    return NextResponse.json(
      { error: friendlyAIError(error, "Failed to draft terms. Please try again.") },
      { status: 500 }
    )
  }
}
