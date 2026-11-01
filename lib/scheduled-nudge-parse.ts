// Client-safe parsing for Proposal.scheduledNudge (the server-side dispatcher
// lives in lib/scheduled-nudges.ts, which is server-only).

export type ScheduledNudgeData = {
  at: string
  by: string
  byName?: string
  templateId?: string
  message?: string
  messageName?: string
  mediaUrl?: string
  mediaType?: "video" | "audio"
  mediaPosterUrl?: string
  attempts?: number
}

export function parseScheduledNudge(json: string | null | undefined): ScheduledNudgeData | null {
  if (!json) return null
  try {
    const o = JSON.parse(json)
    return o && typeof o.at === "string" && typeof o.by === "string" ? (o as ScheduledNudgeData) : null
  } catch {
    return null
  }
}
