import { getToken } from "next-auth/jwt"
import { NextRequest, NextResponse } from "next/server"

const protectedRoutes = ["/dashboard", "/surveys", "/proposals", "/settings", "/onboarding"]

export async function middleware(request: NextRequest) {
  const token = await getToken({ req: request, secret: process.env.NEXTAUTH_SECRET })
  const { pathname } = request.nextUrl

  // Check if route is protected
  const isProtected = protectedRoutes.some((route) => pathname.startsWith(route))

  // Redirect authenticated users away from auth pages
  if (token && pathname.startsWith("/auth/")) {
    return NextResponse.redirect(new URL("/dashboard", request.url))
  }

  // Redirect unauthenticated users to login
  if (isProtected && !token) {
    return NextResponse.redirect(new URL("/auth/login", request.url))
  }

  // Restricted "Contractor" login: locked to Job Reports only. Everything else is
  // blocked here (defence-in-depth on top of per-route checks) — pages redirect to
  // /reports, disallowed APIs get a 403.
  if (token && (token as { role?: string }).role === "CONTRACTOR") {
    const isApi = pathname.startsWith("/api/")
    const apiAllowed =
      pathname.startsWith("/api/job-sites") ||
      pathname.startsWith("/api/job-reports") ||
      pathname.startsWith("/api/blob") ||
      pathname.startsWith("/api/dictate") ||
      pathname.startsWith("/api/me") ||
      pathname.startsWith("/api/auth") ||
      // org info (name/id/branding) is read-only for the nav + blob upload path
      (pathname.startsWith("/api/organization") && request.method === "GET")
    if (isApi) {
      if (!apiAllowed) return NextResponse.json({ error: "Forbidden" }, { status: 403 })
    } else {
      const pageAllowed = pathname.startsWith("/reports") || pathname.startsWith("/auth")
      if (!pageAllowed) return NextResponse.redirect(new URL("/reports", request.url))
    }
  }

  // Add organization context to request headers
  if (token && (token as any).organizationId) {
    const requestHeaders = new Headers(request.headers)
    requestHeaders.set("x-organization-id", (token as any).organizationId as string)
    requestHeaders.set("x-user-id", token.sub as string)

    return NextResponse.next({
      request: {
        headers: requestHeaders,
      },
    })
  }

  return NextResponse.next()
}

export const config = {
  matcher: [
    /*
     * Match everything except static assets. API routes ARE included so the
     * Contractor-role lockdown can 403 disallowed API calls (unauthenticated
     * public API routes still pass through — they have no token).
     */
    "/((?!_next/static|_next/image|favicon.ico).*)",
  ],
}
