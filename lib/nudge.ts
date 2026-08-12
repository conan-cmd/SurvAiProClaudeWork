// Default gentle-reminder body for unsigned proposals. Shared by the nudge
// email route (fallback when the org hasn't customised it) and the Settings
// page (shown as the placeholder) — keep it client-safe (no "server-only").

export const DEFAULT_NUDGE_MESSAGE =
  "Great to hear you'd like to go ahead — let's make it official! " +
  "Please select the items you require and sign your proposal so we can get you booked in."
