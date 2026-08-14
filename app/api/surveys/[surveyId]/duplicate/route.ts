import { NextRequest, NextResponse } from "next/server"
import { getCurrentUser } from "@/lib/session"
import { duplicateSurvey } from "@/lib/duplicate"

// Deep-copies a survey (details + photos) as a fresh draft with no proposal, so
// a similar job can be reused. Voice notes/transcripts are intentionally skipped.
export async function POST(
  _request: NextRequest,
  { params }: { params: { surveyId: string } }
) {
  const user = await getCurrentUser()
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  const copy = await duplicateSurvey(params.surveyId, user)
  if (!copy) return NextResponse.json({ error: "Not found" }, { status: 404 })

  return NextResponse.json({ id: copy.id }, { status: 201 })
}
