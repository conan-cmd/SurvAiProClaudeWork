// Nav sections an owner/admin can show/hide per team member (Settings → Team).
// Dashboard and Settings are always visible; a Contractor's nav is fixed to
// Reports only. Shared by server (layout) and client (settings) — keep it
// dependency-free (no "server-only").

export const HIDEABLE_SECTIONS = [
  { key: "surveys", label: "Surveys" },
  { key: "proposals", label: "Proposals" },
  { key: "rams", label: "RAMS" },
  { key: "reports", label: "Reports" },
  { key: "customers", label: "Customers" },
  { key: "gallery", label: "Gallery" },
] as const

export type SectionKey = (typeof HIDEABLE_SECTIONS)[number]["key"]

export const SECTION_KEYS: SectionKey[] = HIDEABLE_SECTIONS.map((s) => s.key)

// User.navSections is a JSON array of the keys this user sees. Null/invalid =
// role default: every section, except Reports which stays hidden for MEMBERs
// until granted — so existing teams don't get an unexplained new tab.
export function visibleSectionKeys(user: { role: string; navSections?: string | null }): SectionKey[] {
  if (user.navSections) {
    try {
      const arr = JSON.parse(user.navSections)
      if (Array.isArray(arr)) return SECTION_KEYS.filter((k) => arr.includes(k))
    } catch {
      // fall through to the role default
    }
  }
  return SECTION_KEYS.filter(
    (k) => k !== "reports" || user.role === "OWNER" || user.role === "ADMIN"
  )
}
