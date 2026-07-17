import OpenAI from "openai"
import { TemplateDef } from "./templates"

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
})

export type GeneratedSection = {
  type: string
  title: string
  content: string
}

export type GenerationInput = {
  template: TemplateDef
  tone: string
  company: {
    name: string
    services: string[]
    areas: string[]
    yearEstablished?: number | null
    mainUSP?: string | null
    reviewCount?: number | null
    whyChooseUs?: string | null
  }
  client: {
    name: string
    company?: string | null
    address: string
  }
  survey: {
    title: string
    serviceType: string
    isResidential: boolean
    writtenDescription?: string | null
    clientPriorities?: string | null
    accessNotes?: string | null
    measurements?: string | null
    exclusions?: string | null
  }
  approvedTranscripts: string[]
  photoCaptions: string[]
}

const SYSTEM_PROMPT = `You are an expert proposal writer for UK service businesses (exterior cleaning, roofing, restoration and similar trades).

Hard rules:
- NEVER invent facts, measurements, prices, dates, accreditations, or client details. Use only the information provided.
- NEVER state or estimate prices anywhere — pricing is handled separately by the user.
- If information needed for a section is missing, write what you can and add a line starting with "MISSING:" describing what the user should add.
- If you make an assumption, state it explicitly in a line starting with "ASSUMPTION:".
- Write site-specific content referencing the actual survey details, not generic filler.
- British English. No markdown headings inside content (the section title is rendered separately). Use short paragraphs and "- " bullet lists where helpful.

Style guide (follow the winning-proposal voice):
- Warm, direct and personal — written by the owner to a person, not corporate boilerplate. First person plural ("we"), address the client by first name where known.
- "welcome_letter" sections open with "Dear [first name]," then "Thank you for this opportunity!" — thank them for the chance to quote, one short paragraph of company credibility drawn ONLY from the provided facts (e.g. years established, who they help), one sentence on the method and its client benefit ("no damage", "restore", "protect"), an invitation to get in touch with questions, and sign off "Kind regards," followed by nothing (the user's name/number is added by them).
- "findings" sections read like a walkthrough: reference the site visit and what was surveyed, describe what was found area by area, proactively flag any problems observed (e.g. blockages, damage, flaking paint) and their consequence for the client, and recommend how to address them. If the surveyor noted an access approach, explain WHY it benefits the client (safety, cost saved, no road closures, less disruption).
- Lead with client benefit: kerb appeal, protecting the property, extending lifespan, avoiding water ingress — tie every recommendation to a concrete outcome.
- "scope" sections state exactly what is included, area by area, in plain bullet points a client can check off.
- Sell gently through expertise and proof, never hype. No exclamation marks outside the welcome letter greeting.`

export async function generateProposalSections(
  input: GenerationInput
): Promise<GeneratedSection[]> {
  const aiSections = input.template.sections.filter((s) => s.aiGenerated)

  const userPrompt = `Write the following proposal sections: ${aiSections
    .map((s) => `"${s.type}" (${s.title})`)
    .join(", ")}.

Tone: ${input.tone.toLowerCase()}

COMPANY (for context only — do not oversell beyond these facts):
- Name: ${input.company.name}
- Services: ${input.company.services.join(", ") || "not provided"}
- Areas covered: ${input.company.areas.join(", ") || "not provided"}
- Established: ${input.company.yearEstablished ?? "not provided"}
- USP: ${input.company.mainUSP || "not provided"}
- 5-star reviews: ${input.company.reviewCount ?? "not provided"}
- Why clients choose them: ${input.company.whyChooseUs || "not provided"}

CLIENT:
- Name: ${input.client.name}
- Company: ${input.client.company || "n/a"}
- Site address: ${input.client.address}
- Property type: ${input.survey.isResidential ? "Residential" : "Commercial"}

JOB:
- Title: ${input.survey.title}
- Service type: ${input.survey.serviceType}
- Written survey description: ${input.survey.writtenDescription || "none provided"}
- Client priorities: ${input.survey.clientPriorities || "none provided"}
- Access notes: ${input.survey.accessNotes || "none provided"}
- Measurements: ${input.survey.measurements || "none provided"}
- Exclusions stated by surveyor: ${input.survey.exclusions || "none provided"}

APPROVED VOICE-NOTE TRANSCRIPTS (surveyor's own words from site):
${input.approvedTranscripts.length ? input.approvedTranscripts.map((t, i) => `[${i + 1}] ${t}`).join("\n") : "none"}

PHOTO CAPTIONS:
${input.photoCaptions.length ? input.photoCaptions.map((c) => `- ${c}`).join("\n") : "none"}

Respond with JSON: {"sections": [{"type": "...", "content": "..."}]} — one entry per requested section type, in the order requested.`

  const response = await openai.chat.completions.create({
    model: "gpt-4-turbo-preview",
    messages: [
      { role: "system", content: SYSTEM_PROMPT },
      { role: "user", content: userPrompt },
    ],
    response_format: { type: "json_object" },
    temperature: 0.5,
    max_tokens: 4000,
  })

  const parsed = JSON.parse(response.choices[0].message.content || '{"sections":[]}')
  const byType = new Map<string, string>(
    (parsed.sections || []).map((s: { type: string; content: string }) => [s.type, s.content])
  )

  return aiSections.map((def) => ({
    type: def.type,
    title: def.title,
    content: byType.get(def.type) || "⚠ MISSING: This section could not be generated. Please write it manually or regenerate.",
  }))
}

export async function regenerateSection(params: {
  sectionType: string
  sectionTitle: string
  currentContent: string
  context: string
  tone: string
  feedback?: string
}): Promise<string> {
  const response = await openai.chat.completions.create({
    model: "gpt-4-turbo-preview",
    messages: [
      { role: "system", content: SYSTEM_PROMPT },
      {
        role: "user",
        content: `Rewrite this single proposal section ("${params.sectionTitle}"). Tone: ${params.tone.toLowerCase()}.

CONTEXT:
${params.context}

CURRENT CONTENT:
${params.currentContent}

${params.feedback ? `USER FEEDBACK TO APPLY: ${params.feedback}` : "Improve clarity and impact while keeping every fact unchanged."}

Respond with the rewritten section content only — plain text, no JSON, no heading.`,
      },
    ],
    temperature: 0.5,
    max_tokens: 1200,
  })

  return response.choices[0].message.content || params.currentContent
}
