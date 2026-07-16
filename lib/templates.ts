export type SectionDef = {
  type: string
  title: string
  aiGenerated: boolean // false = filled from org profile / structured data
}

export type TemplateDef = {
  id: "QUICK_QUOTE" | "CONSULTATIVE" | "AUTHORITY"
  name: string
  description: string
  bestFor: string
  sections: SectionDef[]
}

export const TEMPLATES: TemplateDef[] = [
  {
    id: "QUICK_QUOTE",
    name: "Quick Quote",
    description: "Short and to the point. Cover, scope, photos, price.",
    bestFor: "Small, straightforward jobs where speed matters",
    sections: [
      { type: "cover", title: "Cover", aiGenerated: false },
      { type: "scope", title: "Scope of Works", aiGenerated: true },
      { type: "photos", title: "Site Photos", aiGenerated: false },
      { type: "pricing", title: "Pricing", aiGenerated: false },
      { type: "exclusions", title: "Exclusions", aiGenerated: true },
      { type: "terms", title: "Terms", aiGenerated: false },
    ],
  },
  {
    id: "CONSULTATIVE",
    name: "Consultative Proposal",
    description: "Explains the problem and your recommended solution.",
    bestFor: "Mid-value jobs where the client is comparing quotes",
    sections: [
      { type: "cover", title: "Cover", aiGenerated: false },
      { type: "executive_summary", title: "Executive Summary", aiGenerated: true },
      { type: "problem", title: "Problem Identified", aiGenerated: true },
      { type: "solution", title: "Recommended Solution", aiGenerated: true },
      { type: "scope", title: "Scope of Works", aiGenerated: true },
      { type: "photos", title: "Site Photos", aiGenerated: false },
      { type: "pricing", title: "Pricing", aiGenerated: false },
      { type: "next_steps", title: "Next Steps", aiGenerated: true },
      { type: "terms", title: "Terms", aiGenerated: false },
    ],
  },
  {
    id: "AUTHORITY",
    name: "Authority Proposal",
    description: "Full credibility build: findings, methodology, About Us, Why Choose Us.",
    bestFor: "High-value or commercial work where trust wins the job",
    sections: [
      { type: "cover", title: "Cover", aiGenerated: false },
      { type: "executive_summary", title: "Executive Summary", aiGenerated: true },
      { type: "findings", title: "Survey Findings", aiGenerated: true },
      { type: "solution", title: "Recommended Solution", aiGenerated: true },
      { type: "scope", title: "Scope of Works", aiGenerated: true },
      { type: "methodology", title: "Methodology", aiGenerated: true },
      { type: "about_us", title: "About Us", aiGenerated: false },
      { type: "why_choose_us", title: "Why Choose Us", aiGenerated: false },
      { type: "similar_projects", title: "Similar Projects", aiGenerated: true },
      { type: "pricing", title: "Pricing", aiGenerated: false },
      { type: "terms", title: "Terms", aiGenerated: false },
    ],
  },
]

export function getTemplate(id: string): TemplateDef | undefined {
  return TEMPLATES.find((t) => t.id === id)
}

/**
 * Recommend a template from job signals. The user can always override.
 */
export function recommendTemplate(params: {
  isResidential: boolean
  serviceType: string
  descriptionLength: number
}): TemplateDef["id"] {
  if (!params.isResidential) return "AUTHORITY"
  if (params.descriptionLength > 600) return "CONSULTATIVE"
  return "QUICK_QUOTE"
}
