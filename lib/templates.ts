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
    description: "Welcome letter, scope, photos and investment. Fast and personal.",
    bestFor: "Small, straightforward jobs where speed matters",
    sections: [
      { type: "cover", title: "Cover", aiGenerated: false },
      { type: "welcome_letter", title: "Welcome", aiGenerated: true },
      { type: "scope", title: "Scope of Works", aiGenerated: true },
      { type: "photos", title: "Required Work - Site Photos", aiGenerated: false },
      { type: "pricing", title: "Investment", aiGenerated: false },
      { type: "exclusions", title: "Exclusions", aiGenerated: true },
      { type: "terms", title: "Terms and Conditions", aiGenerated: false },
    ],
  },
  {
    id: "CONSULTATIVE",
    name: "Consultative Proposal",
    description: "Adds survey findings and recommendations ahead of the investment table.",
    bestFor: "Mid-value jobs where the client is comparing quotes",
    sections: [
      { type: "cover", title: "Cover", aiGenerated: false },
      { type: "welcome_letter", title: "Welcome", aiGenerated: true },
      { type: "findings", title: "Survey Findings & Recommendations", aiGenerated: true },
      { type: "solution", title: "Recommended Solution", aiGenerated: true },
      { type: "scope", title: "Scope of Works", aiGenerated: true },
      { type: "photos", title: "Required Work - Site Photos", aiGenerated: false },
      { type: "pricing", title: "Investment", aiGenerated: false },
      { type: "next_steps", title: "Next Steps", aiGenerated: true },
      { type: "terms", title: "Terms and Conditions", aiGenerated: false },
    ],
  },
  {
    id: "AUTHORITY",
    name: "Authority Proposal",
    description: "Full credibility build: team, credentials, method, similar work, findings.",
    bestFor: "High-value or commercial work where trust wins the job",
    sections: [
      { type: "cover", title: "Cover", aiGenerated: false },
      { type: "welcome_letter", title: "Welcome", aiGenerated: true },
      { type: "about_us", title: "About Us", aiGenerated: false },
      { type: "why_choose_us", title: "Why Choose Us", aiGenerated: false },
      { type: "methodology", title: "Our Method", aiGenerated: true },
      { type: "similar_projects", title: "Examples of Similar Work", aiGenerated: true },
      { type: "findings", title: "Survey Findings & Recommendations", aiGenerated: true },
      { type: "scope", title: "Scope of Works", aiGenerated: true },
      { type: "photos", title: "Required Work - Site Photos", aiGenerated: false },
      { type: "pricing", title: "Investment", aiGenerated: false },
      { type: "terms", title: "Terms and Conditions", aiGenerated: false },
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
