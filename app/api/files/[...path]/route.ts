import { NextRequest, NextResponse } from "next/server"
import { readFile } from "fs/promises"
import path from "path"

// Serves locally stored uploads. File paths contain a random suffix so URLs
// are unguessable — the same security model as Vercel Blob public URLs.
const LOCAL_ROOT = path.join(process.cwd(), "uploads")

const MIME: Record<string, string> = {
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".png": "image/png",
  ".webp": "image/webp",
  ".heic": "image/heic",
  ".svg": "image/svg+xml",
  ".webm": "audio/webm",
  ".mp3": "audio/mpeg",
  ".wav": "audio/wav",
  ".m4a": "audio/mp4",
  ".ogg": "audio/ogg",
}

export async function GET(
  _request: NextRequest,
  { params }: { params: { path: string[] } }
) {
  const rel = params.path.join("/")
  if (rel.includes("..")) {
    return NextResponse.json({ error: "Invalid path" }, { status: 400 })
  }

  const abs = path.resolve(LOCAL_ROOT, rel)
  if (!abs.startsWith(path.resolve(LOCAL_ROOT))) {
    return NextResponse.json({ error: "Invalid path" }, { status: 400 })
  }

  try {
    const data = await readFile(abs)
    const ext = path.extname(abs).toLowerCase()
    return new NextResponse(data, {
      headers: {
        "Content-Type": MIME[ext] || "application/octet-stream",
        "Cache-Control": "private, max-age=3600",
      },
    })
  } catch {
    return NextResponse.json({ error: "Not found" }, { status: 404 })
  }
}
