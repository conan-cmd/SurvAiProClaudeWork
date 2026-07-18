import { NextRequest, NextResponse } from "next/server"
import { db } from "@/lib/db"
import { getCurrentUser } from "@/lib/session"
import { uploadVoiceNote } from "@/lib/storage"
import OpenAI from "openai"

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY })

const MAX_AUDIO_BYTES = 25 * 1024 * 1024 // Whisper API limit for direct upload
const MAX_VIDEO_BYTES = 200 * 1024 * 1024 // we extract the audio track ourselves
const AUDIO_TYPES = [
  "audio/webm", "audio/mp4", "audio/mpeg", "audio/wav", "audio/x-m4a", "audio/ogg",
]
// Video walkthroughs, including iPhone .MOV - converted server-side with ffmpeg
const VIDEO_TYPES = ["video/mp4", "video/webm", "video/quicktime"]

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
    const baseType = file.type.split(";")[0]
    const isVideo = VIDEO_TYPES.includes(baseType)
    const isAudio = AUDIO_TYPES.some((t) => baseType === t)
    if (!isVideo && !isAudio) {
      return NextResponse.json(
        { error: `Unsupported file type: ${file.type}` },
        { status: 400 }
      )
    }
    if (isVideo && file.size > MAX_VIDEO_BYTES) {
      return NextResponse.json(
        { error: "Video is over 200MB. Please record a shorter walkthrough." },
        { status: 400 }
      )
    }

    // Videos (and oversized audio) get their audio track extracted to a
    // compact MP3 so any phone format and length fits Whisper's 25MB limit.
    let transcriptionFile = file
    if (isVideo || file.size > MAX_AUDIO_BYTES) {
      const { extractAudioForTranscription } = await import("@/lib/media")
      transcriptionFile = await extractAudioForTranscription(file)
      if (transcriptionFile.size > MAX_AUDIO_BYTES) {
        return NextResponse.json(
          { error: "Recording is too long to transcribe. Please split it into shorter walkthroughs." },
          { status: 400 }
        )
      }
    }

    // 1. Store the original file (video kept for future frame extraction)
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
      file: transcriptionFile,
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
