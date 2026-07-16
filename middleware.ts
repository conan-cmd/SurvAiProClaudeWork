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
     * Match all request paths except for the ones starting with:
     * - api (API routes)
     * - _next/static (static files)
     * - _next/image (image optimization files)
     * - favicon.ico (favicon file)
     */
    "/((?!api|_next/static|_next/image|favicon.ico).*)",
  ],
}
