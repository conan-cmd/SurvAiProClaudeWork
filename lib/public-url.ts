import "server-only"

// Base URL for links shown to clients (proposal share/email links, invites,
// payment redirects). Prefers PUBLIC_BASE_URL — the branded public domain — over
// NEXTAUTH_URL (which is tied to auth callbacks), falling back to the request
// origin. Keep OAuth/auth redirects on NEXTAUTH_URL, not this.
export function publicBaseUrl(fallbackOrigin: string): string {
  return process.env.PUBLIC_BASE_URL || process.env.NEXTAUTH_URL || fallbackOrigin
}
