// Phone-call log helpers. Client-safe (no "server-only") — shared by the call
// API route, the proposal lists and the call dialog.

export type CallRecord = {
  at: string
  by?: string
  // Raw note the caller dictated/typed after the call.
  notes?: string
  // AI-tidied 1–2 sentence summary of the note.
  summary?: string
  nextStep?: string
}

export function parseCallLog(json: string | null | undefined): CallRecord[] {
  if (!json) return []
  try {
    const arr = JSON.parse(json)
    return Array.isArray(arr) ? arr.filter((r): r is CallRecord => r && typeof r.at === "string") : []
  } catch {
    return []
  }
}
