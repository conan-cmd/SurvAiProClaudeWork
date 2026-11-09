import { NextResponse } from "next/server"

// Which build is live? Vercel injects the deployed commit at build time.
// Public and harmless: the repo SHA identifies a build, nothing more.
export const dynamic = "force-dynamic"

export async function GET() {
  return NextResponse.json({
    commit: process.env.VERCEL_GIT_COMMIT_SHA || null,
    message: process.env.VERCEL_GIT_COMMIT_MESSAGE?.split("\n")[0] || null,
    deployedAt: process.env.VERCEL_DEPLOYMENT_COMPLETED_AT || null,
  })
}
