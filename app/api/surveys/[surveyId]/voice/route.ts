import { NextRequest, NextResponse } from "next/server"
import { db } from "@/lib/db"
import { getCurrentUser } from "@/lib/session"
import { uploadVoiceNote } from "@/lib/storage"
import OpenAI from "openai"

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY })

const MAX_AUDIO_BYTES = 25 * 1024 * 1024 // Whisper API limit
const ALLOWED_TYPES = [
  "audio/webm", "audio/mp4", "audio/mpeg", "audio/wav", "audio/x-m4a", "audio/ogg",
  // Video walkthroughs: Whisper transcribes the audio track directly
  "video/mp4", "video/webm",
]

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

  try {
    const formData = await request.formData()
    const file = formData.get("audio") as File | null
    const duration = parseInt((formData.get("duration") as string) || "0")

    if (!file) {
      return NextResponse.json({ error: "No audio file provided" }, { status: 400 })
    }
    if (!ALLOWED_TYPES.some((t) => file.type.startsWith(t.split(";")[0]))) {
      return NextResponse.json(
        { error: `Unsupported audio type: ${file.type}` },
        { status: 400 }
      )
    }
    if (file.size > MAX_AUDIO_BYTES) {
      return NextResponse.json(
        { error: "Audio file is over 25MB. Please record a shorter note." },
        { status: 400 }
      )
    }

    // 1. Store the audio
    const url = await uploadVoiceNote(file, user.organizationId, survey.id)

    const voiceNote = await db.voiceNote.create({
      data: {
        surveyId: survey.id,
        fileUrl: url,
        fileName: file.name || "voice-note",
        duration,
      },
    })

    // 2. Transcribe with Whisper
    const transcription = await openai.audio.transcriptions.create({
      file,
      model: "whisper-1",
    })

    // 3. Save transcript as UNAPPROVED — the user must review it
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
    console.error("Voice note error:", error)
    const { friendlyAIError } = await import("@/lib/ai")
    return NextResponse.json(
      { error: friendlyAIError(error, "Failed to process voice note. Please try again.") },
      { status: 500 }
    )
  }
}
