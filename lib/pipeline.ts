// Pipeline board stages — user-nameable columns for open proposals. Shared by
// the board page and the org API; client-safe (no "server-only").

export type PipelineStage = { id: string; name: string }

export const DEFAULT_PIPELINE_STAGES: PipelineStage[] = [
  { id: "draft", name: "Draft" },
  { id: "sent", name: "Sent" },
  { id: "fu1", name: "One follow-up" },
  { id: "fu2", name: "Two+ follow-ups" },
]

export function parsePipelineStages(org: { pipelineStages?: string | null }): PipelineStage[] {
  if (org.pipelineStages) {
    try {
      const arr = JSON.parse(org.pipelineStages)
      if (Array.isArray(arr)) {
        const valid = arr.filter(
          (s): s is PipelineStage => s && typeof s.id === "string" && typeof s.name === "string" && s.name.trim() !== ""
        )
        if (valid.length) return valid
      }
    } catch {
      // fall through to defaults
    }
  }
  return DEFAULT_PIPELINE_STAGES
}
