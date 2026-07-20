import { NextRequest, NextResponse } from "next/server"
import { z } from "zod"
import OpenAI from "openai"
import { db } from "@/lib/db"
import { getCurrentUser } from "@/lib/session"

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY })

export const maxDuration = 60 // download + ffmpeg + transcription

const MAX_WHISPER_BYTES = 25 * 1024 * 1024

const bodySchema = z.object({
  url: z.string().url(),
  fileName: z.string().max(200).default("walkthrough"),
  mimeType: z.string().max(100),
  duration: z.number().int().min(0).default(0),
})

// Finalises a direct-to-Blob upload: the file is already in storage, we just
// pull it back, extract/transcribe the audio and create the transcript.
export async function POST(
  request: NextRequest,
  { params }: { params: { surveyId: string } }
) {
  const user = await getCurrentUser()
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  const survey = await db.siteSurvey.findFirst({
    where: { id: params.surveyId, organizationId: user.organizationId },
  })
  if (!survey) return NextResponse.json({ error: "Not found" }, { status: 404 })

  const parsed = bodySchema.safeParse(await request.json())
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.errors[0].message }, { status: 400 })
  }
  const { url, fileName, mimeType, duration } = parsed.data

  // Only accept blobs uploaded into this organisation's own folder
  if (!url.includes(`organizations/${user.organizationId}/`)) {
    return NextResponse.json({ error: "Invalid file location" }, { status: 400 })
  }

  try {
    const blobRes = await fetch(url, { signal: AbortSignal.timeout(45000) })
    if (!blobRes.ok) throw new Error(`Blob fetch returned ${blobRes.status}`)
    const buf = Buffer.from(await blobRes.arrayBuffer())
    let file = new File([new Uint8Array(buf)], fileName, { type: mimeType })

    const isVideo = mimeType.startsWith("video/")
    if (isVideo || file.size > MAX_WHISPER_BYTES) {
      const { extractAudioForTranscription } = await import("@/lib/media")
      file = await extractAudioForTranscription(file)
      if (file.size > MAX_WHISPER_BYTES) {
        return NextResponse.json(
          { error: "Recording is too long to transcribe. Please split it into shorter walkthroughs." },
          { status: 400 }
        )
      }
    }

    const voiceNote = await db.voiceNote.create({
      data: { surveyId: survey.id, fileUrl: url, fileName, duration },
    })

    const transcription = await openai.audio.transcriptions.create({
      file,
      model: "whisper-1",
    })

    const transcript = await db.transcript.create({
      data: {
        voiceNoteId: voiceNote.id,
        surveyId: survey.id,
        text: transcription.text,
        approved: false,
      },
    })

    return NextResponse.json({ voiceNote, transcript }, { status: 201 })
  } catch (error) {
    console.error("From-blob transcription error:", error)
    const { friendlyAIError } = await import("@/lib/ai")
    return NextResponse.json(
      { error: friendlyAIError(error, "Failed to process the recording. Please try again.") },
      { status: 500 }
    )
  }
}
