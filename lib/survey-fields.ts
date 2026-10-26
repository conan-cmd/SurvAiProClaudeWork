// Trade-specific survey questions. Each organisation has a trade (picked at
// onboarding / Settings) that seeds a preset question list, which they can
// customise freely. Answers live in SiteSurvey.customAnswers JSON; fields with
// a legacyKey keep writing the original columns so RAMS/COSHH and older
// surveys carry on unchanged. Client-safe (no "server-only").

export type SurveyFieldDef = {
  id: string
  label: string
  hint?: string
  // Shown on the client-facing proposal as a site detail (rendering lands in
  // the onboarding phase; the flag is stored from day one).
  showOnProposal?: boolean
  // Writes the original SiteSurvey column instead of customAnswers.
  legacyKey?: "chemicalsRequired" | "waterSupply"
}

export type TradePreset = { id: string; label: string; fields: SurveyFieldDef[] }

// Useful whatever the trade.
const UNIVERSAL: SurveyFieldDef[] = [
  { id: "parking", label: "Parking & loading", hint: "e.g. driveway available, permit zone, nearest loading point" },
  { id: "site-contact", label: "Site contact", hint: "Who to ask for on the day — name & number" },
]

export const TRADE_PRESETS: TradePreset[] = [
  {
    id: "exterior-cleaning",
    label: "Exterior cleaning",
    fields: [
      ...UNIVERSAL,
      { id: "chemicals", label: "Chemicals required", hint: "e.g. sodium hypochlorite 5%, biocide, softwash mix", legacyKey: "chemicalsRequired" },
      { id: "water", label: "Water supply", hint: "e.g. outside tap on-site / bring bowser / low pressure", legacyKey: "waterSupply" },
      { id: "drainage", label: "Drainage & run-off", hint: "Where does run-off go? Any drains to protect?" },
    ],
  },
  {
    id: "roofing",
    label: "Roofing",
    fields: [
      ...UNIVERSAL,
      { id: "roof-type", label: "Roof type & pitch", hint: "e.g. concrete tile, slate, flat EPDM; approx pitch" },
      { id: "roof-access", label: "Access & scaffold", hint: "Ladder/tower/scaffold needed? Which elevations?" },
      { id: "roof-condition", label: "Condition notes", hint: "Broken tiles, flashing, membrane, fascias, moss" },
    ],
  },
  {
    id: "landscaping",
    label: "Landscaping & grounds",
    fields: [
      ...UNIVERSAL,
      { id: "ground-access", label: "Garden/side access", hint: "Gate widths, machinery access, slopes" },
      { id: "waste", label: "Waste & spoil removal", hint: "Skip location, green waste volumes" },
      { id: "services-below", label: "Underground services", hint: "Known pipes/cables/drainage runs" },
    ],
  },
  {
    id: "driveways",
    label: "Driveways & paving",
    fields: [
      ...UNIVERSAL,
      { id: "surface", label: "Existing surface & sub-base", hint: "e.g. block paving on sand, cracked concrete" },
      { id: "drainage", label: "Drainage & falls", hint: "Where does water need to go? SUDS requirements?" },
      { id: "waste", label: "Excavation & waste", hint: "Dig depth, muck-away loads, skip space" },
    ],
  },
  {
    id: "rendering",
    label: "Rendering & plastering",
    fields: [
      ...UNIVERSAL,
      { id: "substrate", label: "Substrate & condition", hint: "e.g. blown sand/cement render, brick, blockwork" },
      { id: "render-access", label: "Access & scaffold", hint: "Elevations needing scaffold, ground conditions" },
      { id: "finish", label: "Finish & colour", hint: "e.g. silicone thin-coat, K-Rend colour choice" },
    ],
  },
  {
    id: "electrical",
    label: "Electrical",
    fields: [
      ...UNIVERSAL,
      { id: "consumer-unit", label: "Consumer unit & supply", hint: "Location, age, spare ways, earthing type" },
      { id: "certification", label: "Certification required", hint: "EICR, EIC, minor works, Part P notification" },
      { id: "isolation", label: "Isolation & power-down", hint: "Can supply be isolated? When?" },
    ],
  },
  {
    id: "plumbing",
    label: "Plumbing & heating",
    fields: [
      ...UNIVERSAL,
      { id: "stopcock", label: "Stopcock & isolation", hint: "Location, working? Drain-down needed?" },
      { id: "boiler", label: "Boiler/system details", hint: "Make, model, age, flue position" },
      { id: "pipework", label: "Pipework & condition", hint: "Material, runs affected, known issues" },
    ],
  },
  {
    id: "builder",
    label: "General builder",
    fields: [
      ...UNIVERSAL,
      { id: "structure", label: "Structural notes", hint: "Walls affected, lintels, engineer involvement" },
      { id: "waste", label: "Waste & skip", hint: "Skip location, muck-away, permits" },
      { id: "welfare", label: "Welfare & storage", hint: "Toilet access, material storage, power on site" },
    ],
  },
  {
    id: "other",
    label: "Other trade",
    fields: [...UNIVERSAL],
  },
]

export function presetFor(trade: string | null | undefined): TradePreset {
  return TRADE_PRESETS.find((t) => t.id === trade) ?? TRADE_PRESETS[0]
}

// The org's effective question list: their customised set when saved and
// valid, otherwise their trade's preset (default: exterior cleaning, which
// matches the app's original behaviour).
export function parseSurveyFields(org: { trade?: string | null; surveyFields?: string | null }): SurveyFieldDef[] {
  if (org.surveyFields) {
    try {
      const arr = JSON.parse(org.surveyFields)
      if (Array.isArray(arr)) {
        const valid = arr.filter(
          (f): f is SurveyFieldDef =>
            f && typeof f.id === "string" && typeof f.label === "string" && f.label.trim() !== ""
        )
        if (valid.length) return valid
      }
    } catch {
      // fall through to the preset
    }
  }
  return presetFor(org.trade).fields
}

export function parseCustomAnswers(json: string | null | undefined): Record<string, string> {
  if (!json) return {}
  try {
    const obj = JSON.parse(json)
    return obj && typeof obj === "object" && !Array.isArray(obj) ? (obj as Record<string, string>) : {}
  } catch {
    return {}
  }
}

// Label: answer pairs for AI prompts — merges dynamic answers with the legacy
// columns the exterior preset still writes.
export function answeredPairs(
  fields: SurveyFieldDef[],
  survey: { customAnswers?: string | null; chemicalsRequired?: string | null; waterSupply?: string | null }
): { label: string; value: string }[] {
  const answers = parseCustomAnswers(survey.customAnswers)
  return fields
    .map((f) => ({
      label: f.label,
      value: (f.legacyKey ? survey[f.legacyKey] : answers[f.id])?.trim() || "",
    }))
    .filter((p) => p.value)
}
