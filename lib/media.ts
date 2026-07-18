import "server-only"
import { spawn } from "child_process"
import { writeFile, readFile, unlink, mkdtemp } from "fs/promises"
import { tmpdir } from "os"
import path from "path"
import ffmpegPath from "ffmpeg-static"

/**
 * Extracts the audio track from any video/audio file as a compact mono MP3,
 * sized for the Whisper API. Handles iPhone .MOV, MP4, WebM etc.
 */
export async function extractAudioForTranscription(file: File): Promise<File> {
  if (!ffmpegPath) throw new Error("ffmpeg binary unavailable")

  const dir = await mkdtemp(path.join(tmpdir(), "survai-"))
  const inPath = path.join(dir, "in" + (path.extname(file.name) || ".bin"))
  const outPath = path.join(dir, "out.mp3")

  try {
    await writeFile(inPath, Buffer.from(await file.arrayBuffer()))

    await new Promise<void>((resolve, reject) => {
      const proc = spawn(ffmpegPath as string, [
        "-y",
        "-i", inPath,
        "-vn",              // drop video
        "-ac", "1",         // mono
        "-ar", "16000",     // 16 kHz is plenty for speech
        "-b:a", "48k",
        outPath,
      ])
      let stderr = ""
      proc.stderr.on("data", (d) => (stderr += d))
      proc.on("error", reject)
      proc.on("close", (code) =>
        code === 0 ? resolve() : reject(new Error(`ffmpeg exited ${code}: ${stderr.slice(-400)}`))
      )
    })

    const audio = await readFile(outPath)
    return new File([audio], "audio.mp3", { type: "audio/mpeg" })
  } finally {
    await unlink(inPath).catch(() => {})
    await unlink(outPath).catch(() => {})
  }
}
