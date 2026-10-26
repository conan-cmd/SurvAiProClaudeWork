import "server-only"

// Platform admins (SurvAIPro team) — allowed to manage access codes etc.
// Configurable via ADMIN_EMAILS (comma-separated); defaults to Conan.
export function adminEmails(): string[] {
  return (process.env.ADMIN_EMAILS || "conan@lbcclean.co.uk")
    .split(",")
    .map((e) => e.trim().toLowerCase())
    .filter(Boolean)
}

export function isPlatformAdmin(user: { email?: string | null } | null): boolean {
  if (!user?.email) return false
  return adminEmails().includes(user.email.toLowerCase())
}
