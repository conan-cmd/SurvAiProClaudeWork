import { NextRequest, NextResponse } from "next/server"
import OpenAI from "openai"
import { getCurrentUser } from "@/lib/session"
import { planFromCommand } from "@/lib/assistant"
import { friendlyAIError } from "@/lib/ai"

export const maxDuration = 60

const MAX_AUDIO_BYTES = 25 * 1024 * 1024

// Voice/text command → transcript → plan (read tools executed, write actions
// queued for confirmation). Accepts multipart {audio} or JSON {text}.
export async function POST(request: NextRequest) {
  const user = await getCurrentUser()
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  try {
    let command = ""
    const contentType = request.headers.get("content-type") || ""
    if (contentType.includes("multipart/form-data")) {
      const formData = await request.formData()
      const file = formData.get("audio") as File | null
      if (!file) return NextResponse.json({ error: "No audio provided" }, { status: 400 })
      if (file.size > MAX_AUDIO_BYTES) {
        return NextResponse.json({ error: "Recording too long" }, { status: 400 })
      }
      const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY })
      const transcription = await openai.audio.transcriptions.create({
        file,
        model: "whisper-1",
        language: "en",
      })
      command = transcription.text?.trim() || ""
    } else {
      const body = (await request.json().catch(() => ({}))) as { text?: string }
      command = (body.text || "").trim()
    }

    if (!command) return NextResponse.json({ error: "Didn't catch that — try again" }, { status: 400 })
    if (command.length > 2000) command = command.slice(0, 2000)

    const plan = await planFromCommand(user, command)
    return NextResponse.json({ transcript: command, reply: plan.reply, actions: plan.actions })
  } catch (error) {
    console.error("Assistant error:", error)
    return NextResponse.json(
      { error: friendlyAIError(error, "The assistant hit a snag — please try again.") },
      { status: 500 }
    )
  }
}
