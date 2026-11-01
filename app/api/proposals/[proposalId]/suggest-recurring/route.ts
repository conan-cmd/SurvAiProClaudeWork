import { NextRequest, NextResponse } from "next/server"
import OpenAI from "openai"
import { db } from "@/lib/db"
import { getCurrentUser } from "@/lib/session"
import { friendlyAIError } from "@/lib/ai"
import { calculateProposalTotals } from "@/lib/utils"

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY })

export const maxDuration = 30

// Suggests recurring-service upsells for the pricing table — e.g. an annual
// maintenance plan after a roof clean, or a quarterly bin-store service at a
// reduced rate. Pure suggestion: the user reviews and adds each one as a
// client-selectable optional extra.
export async function POST(_req: NextRequest, { params }: { params: { proposalId: string } }) {
  const user = await getCurrentUser()
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  const proposal = await db.proposal.findFirst({
    where: { id: params.proposalId, organizationId: user.organizationId },
    select: {
      clientName: true,
      pricingLineItems: true,
      survey: { select: { title: true, serviceType: true, isResidential: true } },
      organization: { select: { trade: true, mainServices: true, name: true } },
    },
  })
  if (!proposal) return NextResponse.json({ error: "Not found" }, { status: 404 })
  const lines = proposal.pricingLineItems.filter((l) => l.description.trim() && !l.isOptional)
  if (!lines.length) {
    return NextResponse.json({ error: "Add your main pricing lines first — suggestions are based on them" }, { status: 409 })
  }
  const totals = calculateProposalTotals(proposal.pricingLineItems)

  try {
    const response = await openai.chat.completions.create({
      model: "gpt-4o",
      messages: [
        {
          role: "system",
          content: `You suggest recurring-service upsells for a UK trade quote. Rules:
- Suggest 1-2 options a client would genuinely value for THIS job: maintenance plans, quarterly/6-monthly/annual return visits at a reduced per-visit rate vs the one-off price, top-up treatments.
- Price realistically: a recurring visit is typically 30-60% of the comparable one-off line (less prep/buildup), rounded to a sensible figure. Annual plans can be priced per visit or per year — say which in the description.
- Each description is CLIENT-FACING: one sentence, benefit-led, includes the frequency. No hype.
- unit is one of: each, visit, item. quantity is 1.
- If no recurring option genuinely fits, return fewer or none.
Respond ONLY JSON: {"suggestions": [{"description": string, "unit": "each"|"visit"|"item", "unitPrice": number, "why": string}]} — "why" is one short internal line for the tradesperson (not shown to the client).`,
        },
        {
          role: "user",
          content:
            `Job: ${proposal.survey.title} (${proposal.survey.serviceType}, ${proposal.survey.isResidential ? "residential" : "commercial"})\n` +
            `Firm trade: ${proposal.organization.trade || "exterior cleaning"}; services: ${proposal.organization.mainServices || "n/a"}\n` +
            `Current pricing lines (net £):\n${lines.map((l) => `- ${l.description}: ${l.quantity} ${l.unit} @ £${l.unitPrice}`).join("\n")}\n` +
            `Quote net total: £${totals.subtotal.toFixed(2)}`,
        },
      ],
      response_format: { type: "json_object" },
      temperature: 0.4,
      max_tokens: 400,
    })
    const parsed = JSON.parse(response.choices[0].message.content || "{}") as {
      suggestions?: { description?: string; unit?: string; unitPrice?: number; why?: string }[]
    }
    const suggestions = (parsed.suggestions || [])
      .filter((s) => typeof s.description === "string" && s.description.trim() && typeof s.unitPrice === "number" && s.unitPrice > 0)
      .slice(0, 2)
      .map((s) => ({
        description: s.description!.trim(),
        unit: ["each", "visit", "item"].includes(s.unit || "") ? s.unit : "visit",
        unitPrice: Math.round(s.unitPrice! * 100) / 100,
        why: typeof s.why === "string" ? s.why : null,
      }))
    return NextResponse.json({ suggestions })
  } catch (err) {
    console.error("Recurring suggestion failed:", err)
    return NextResponse.json({ error: friendlyAIError(err, "Couldn't generate suggestions — try again.") }, { status: 500 })
  }
}
