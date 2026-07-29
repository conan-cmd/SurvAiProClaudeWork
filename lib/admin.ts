import "server-only"

// Platform admins (SurvAIPro team) — allowed to manage access codes etc.
// Configurable via ADMIN_EMAILS (comma-separated); defaults to Conan.
export function isPlatformAdmin(user: { email?: string | null } | null): boolean {
  if (!user?.email) return false
  const list = (process.env.ADMIN_EMAILS || "conan@lbcclean.co.uk")
    .split(",")
    .map((e) => e.trim().toLowerCase())
    .filter(Boolean)
  return list.includes(user.email.toLowerCase())
}
