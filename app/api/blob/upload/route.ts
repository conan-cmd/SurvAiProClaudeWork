import { NextRequest, NextResponse } from "next/server"
import { handleUpload, type HandleUploadBody } from "@vercel/blob/client"
import { getCurrentUser } from "@/lib/session"

// Issues short-lived tokens so the browser can upload straight to Blob
// storage - no 4.5MB serverless body cap, single network hop, real progress.
export async function POST(request: NextRequest) {
  const user = await getCurrentUser()
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  if (!process.env.BLOB_READ_WRITE_TOKEN && !process.env.BLOB_STORE_ID) {
    // Local dev without Blob - client falls back to the multipart path
    return NextResponse.json({ error: "Blob storage not configured" }, { status: 503 })
  }

  const body = (await request.json()) as HandleUploadBody

  try {
    const result = await handleUpload({
      body,
      request,
      onBeforeGenerateToken: async (pathname) => {
        if (!pathname.startsWith(`organizations/${user.organizationId}/`)) {
          throw new Error("Invalid upload path")
        }
        return {
          allowedContentTypes: [
            "video/mp4", "video/webm", "video/quicktime",
            "audio/webm", "audio/mp4", "audio/mpeg", "audio/wav", "audio/x-m4a", "audio/ogg",
            "image/jpeg", "image/png", "image/webp", "image/heic", "image/heif",
            // iPhone HEIC straight from the camera roll sometimes reports no /
            // a generic type - allow octet-stream so those still upload.
            "application/octet-stream",
          ],
          maximumSizeInBytes: 200 * 1024 * 1024,
          addRandomSuffix: true,
        }
      },
      onUploadCompleted: async () => {
        // The client notifies the survey route itself once upload finishes
      },
    })
    return NextResponse.json(result)
  } catch (error) {
    console.error("Blob token error:", error)
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Upload authorisation failed" },
      { status: 400 }
    )
  }
}
