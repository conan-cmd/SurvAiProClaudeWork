import { NextRequest, NextResponse } from "next/server"
import OpenAI from "openai"
import { getCurrentUser } from "@/lib/session"
import { friendlyAIError } from "@/lib/ai"

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY })

const MAX_AUDIO_BYTES = 25 * 1024 * 1024

// Lightweight Whisper transcription for field dictation.
// Returns text only - nothing is stored.
export async function POST(request: NextRequest) {
  const user = await getCurrentUser()
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  try {
    const formData = await request.formData()
    const file = formData.get("audio") as File | null
    if (!file) return NextResponse.json({ error: "No audio provided" }, { status: 400 })
    if (file.size > MAX_AUDIO_BYTES) {
      return NextResponse.json({ error: "Recording too long" }, { status: 400 })
    }

    const transcription = await openai.audio.transcriptions.create({
      file,
      model: "whisper-1",
      language: "en",
    })

    return NextResponse.json({ text: transcription.text })
  } catch (error) {
    console.error("Dictation error:", error)
    return NextResponse.json(
      { error: friendlyAIError(error, "Transcription failed. Please try again.") },
      { status: 500 }
    )
  }
}
