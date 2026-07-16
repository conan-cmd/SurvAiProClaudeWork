import { NextRequest, NextResponse } from "next/server"
import { z } from "zod"
import { db } from "@/lib/db"
import { getCurrentUser } from "@/lib/session"

const updateTranscriptSchema = z.object({
  text: z.string().min(1).optional(),
  approved: z.boolean().optional(),
})

export async function PATCH(
  request: NextRequest,
  { params }: { params: { surveyId: string; transcriptId: string } }
) {
  const user = await getCurrentUser()
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  const transcript = await db.transcript.findFirst({
    where: {
      id: params.transcriptId,
      surveyId: params.surveyId,
      survey: { organizationId: user.organizationId },
    },
  })
  if (!transcript) return NextResponse.json({ error: "Not found" }, { status: 404 })

  const body = await request.json()
  const parsed = updateTranscriptSchema.safeParse(body)
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.errors[0].message }, { status: 400 })
  }

  // Editing the text revokes prior approval unless approval is set in the same request
  const data = { ...parsed.data }
  if (data.text !== undefined && data.approved === undefined) {
    data.approved = false
  }

  const updated = await db.transcript.update({
    where: { id: params.transcriptId },
    data,
  })

  return NextResponse.json(updated)
}
