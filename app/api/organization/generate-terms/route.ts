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
          content: `You draft proposal terms and conditions for UK trades and service businesses. Plain English, one term per line (no numbering, no headings), British English. Cover: quotation validity; one continuous site visit assumption with demobilisation fee for interruptions caused by others; client-provided access, water and electricity; welfare/storage/waste/parking responsibilities; local authority permissions by others; discrepancy between quoted survey and site conditions may incur re-pricing; weather delays; pre-existing defects (e.g. loose pointing, fragile surfaces) not our liability; deposit and payment terms (payment due within 14 days of completion; interest on overdue invoices at 8% over Bank of England base rate per the Late Payment of Commercial Debts Act); title to materials until paid; variations must be agreed in writing; defects notified promptly and we get opportunity to remedy; insurance held; client cancellation rights notice for consumers (14-day cooling-off under Consumer Contracts Regulations where applicable); governing law England and Wales. End with a line advising this is a general template and the business should have terms reviewed professionally.`,
        },
        {
          role: "user",
          content: `Draft 15-20 concise terms for ${org.name}, providing ${services} in the UK. ${typeGuidance}`,
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
