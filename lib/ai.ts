import OpenAI from "openai"
import { TemplateDef } from "./templates"

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
})

// Maps OpenAI auth failures to a message the user can actually act on.
export function friendlyAIError(error: unknown, fallback: string): string {
  const e = error as { status?: number; code?: string }
  if (e?.status === 401 || e?.code === "invalid_api_key") {
    return "AI isn't connected yet — add a valid OPENAI_API_KEY to your environment settings and try again."
  }
  if (e?.status === 429) {
    return "The AI service is rate-limited or out of credit. Check your OpenAI account and try again."
  }
  return fallback
}

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
- Sell gently through expertise and proof, never hype. No exclamation marks outside the welcome letter greeting.

Below are excerpts from real winning proposals. Match their STRUCTURE, RHYTHM and TONE exactly — but every fact in them belongs to a different company: use only the current company's facts, never copy these details.

EXAMPLE welcome letter:
"Dear Maureen,
Thank you for this opportunity!
Thank you for choosing us to provide you with a proposal for your stone cleaning requirements. We are an established exterior cleaning company that has been helping home owners, builders and property managers to make their properties look their best since 2011.
Using super high temperatures and low controlled pressure to clean your stonework we guarantee the best cleaning and restoration results with no damage to the substrate.
Should you have any questions, comments, or concerns regarding this proposal or your stone cleaning requirement, feel free to contact me directly.
Kind regards,"

EXAMPLE survey findings (note how it recounts the visit, flags problems proactively with their consequence, and justifies the access method by client benefit):
"Following our site visit on 16th January and kindly being shown around by Christopher, we have surveyed the exterior of the building including roof top areas. Our proposal below is for steam cleaning all three elevations of the facade including the lower lightwell areas and the boundary wall.
It was found that the gutters and water outlets on the terrace areas are blocked and water is sitting and building up in these areas, which could result in water ingress and flooding to the building, so we recommend getting these unblocked as soon as possible to allow water to escape away from the building. We have included an item below to resolve these blockages.
We believe the best solution for access is using our rope access team. Not only does this allow us to get up close to all areas being cleaned so we can ensure a high standard of clean, but it also removes the need to close the pavement and road, avoiding delays applying for permits to the council and saving costs on road closures and traffic management."`

export type GeneratedLineItem = { description: string }

export type GenerationResult = {
  sections: GeneratedSection[]
  lineItems: GeneratedLineItem[]
}

export async function generateProposalSections(
  input: GenerationInput
): Promise<GenerationResult> {
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

ALSO identify each distinct service or work item in this job (from the service type, survey description, transcripts and measurements) and write one pricing line item per service. Format each as "Service Name - detail sentence describing exactly how the work is done and what it achieves", in the style of these real examples:
- "Steam Clean Roof Cleaning - Steam cleaning all roof tiles to remove all organic staining and restore tiles to original appearance"
- "Gutter Cleaning - Using industrial gutter vac to hoover out all debris in gutters, manually accessing areas if required"
- "Brick Cleaning with Carbon Stain Removal - Using steam cleaning equipment which consists of super-heated water and low pressure to safely and effectively clean the surface. Window protection included"
Only include services actually mentioned in the job information. NEVER include prices or quantities.

Respond with JSON: {"sections": [{"type": "...", "content": "..."}], "lineItems": [{"description": "..."}]} — sections one entry per requested type in the order requested.`

  const response = await openai.chat.completions.create({
    model: "gpt-4o",
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

  const sections = aiSections.map((def) => ({
    type: def.type,
    title: def.title,
    content: byType.get(def.type) || "MISSING: This section could not be generated. Please write it manually or regenerate.",
  }))

  const lineItems: GeneratedLineItem[] = (parsed.lineItems || [])
    .filter((li: { description?: unknown }) => typeof li?.description === "string" && li.description.trim())
    .map((li: { description: string }) => ({ description: li.description.trim() }))

  return { sections, lineItems }
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
    model: "gpt-4o",
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
