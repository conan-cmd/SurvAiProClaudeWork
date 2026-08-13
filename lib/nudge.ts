// Nudge (gentle-reminder) templates + history helpers. Shared by the nudge
// email route, the proposal editor and Settings — keep it client-safe (no
// "server-only").

export type NudgeTemplate = { id: string; name: string; body: string }

export type NudgeRecord = { at: string; templateName: string; by?: string }

export const DEFAULT_NUDGE_MESSAGE =
  "Great to hear you'd like to go ahead — let's make it official! " +
  "Please select the items you require and sign your proposal so we can get you booked in."

export const DEFAULT_NUDGE_TEMPLATES: NudgeTemplate[] = [
  {
    id: "go-ahead",
    name: "Verbal go-ahead",
    body: DEFAULT_NUDGE_MESSAGE,
  },
  {
    id: "checking-in",
    name: "Checking in",
    body:
      "Just checking in on the proposal we sent over — happy to answer any questions or tweak anything. " +
      "When you're ready, you can select the items you'd like and sign it online.",
  },
  {
    id: "final-follow-up",
    name: "Final follow-up",
    body:
      "We're planning the coming weeks' schedule and wanted to give you a last chance to grab your slot. " +
      "If you'd still like to go ahead, just select your items and sign the proposal — otherwise no worries at all.",
  },
]

// Org templates come from Organization.nudgeTemplates (JSON array). Falls back
// to the legacy single Organization.nudgeMessage, then the app defaults.
export function parseNudgeTemplates(org: {
  nudgeTemplates?: string | null
  nudgeMessage?: string | null
}): NudgeTemplate[] {
  if (org.nudgeTemplates) {
    try {
      const arr = JSON.parse(org.nudgeTemplates)
      if (Array.isArray(arr)) {
        const valid = arr.filter(
          (t): t is NudgeTemplate =>
            t && typeof t.id === "string" && typeof t.name === "string" && typeof t.body === "string" && t.body.trim() !== ""
        )
        if (valid.length) return valid
      }
    } catch {
      // fall through
    }
  }
  if (org.nudgeMessage?.trim()) {
    return [
      { id: "custom", name: "Your reminder", body: org.nudgeMessage.trim() },
      ...DEFAULT_NUDGE_TEMPLATES.slice(1),
    ]
  }
  return DEFAULT_NUDGE_TEMPLATES
}

export function parseNudgeHistory(json: string | null | undefined): NudgeRecord[] {
  if (!json) return []
  try {
    const arr = JSON.parse(json)
    return Array.isArray(arr) ? arr.filter((r): r is NudgeRecord => r && typeof r.at === "string") : []
  } catch {
    return []
  }
}
