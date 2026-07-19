import { put, del } from "@vercel/blob"
import { randomBytes } from "crypto"
import { mkdir, writeFile, unlink } from "fs/promises"
import path from "path"

// Falls back to local disk storage when no Vercel Blob token is configured,
// so the app is fully usable in local development.
const useLocalStorage = () =>
  process.env.STORAGE_TYPE === "local" ||
  (!process.env.BLOB_READ_WRITE_TOKEN && !process.env.BLOB_STORE_ID)

const LOCAL_ROOT = path.join(process.cwd(), "uploads")

function sanitizeRelPath(p: string): string {
  return p.replace(/\\/g, "/").replace(/[^a-zA-Z0-9/._-]/g, "_").replace(/\.\.+/g, "_")
}

export async function uploadFile(file: File, filePath: string): Promise<string> {
  try {
    if (useLocalStorage()) {
      const suffix = randomBytes(8).toString("hex")
      const ext = path.extname(file.name || "").slice(0, 10) || ""
      const rel = sanitizeRelPath(`${filePath}-${suffix}${ext}`)
      const abs = path.join(LOCAL_ROOT, rel)
      await mkdir(path.dirname(abs), { recursive: true })
      await writeFile(abs, Buffer.from(await file.arrayBuffer()))
      return `/api/files/${rel}`
    }

    // Vercel Blob: public access; addRandomSuffix makes the URL unguessable,
    // and org-scoped paths keep tenants separated.
    const blob = await put(filePath, file, {
      access: "public",
      addRandomSuffix: true,
    })
    return blob.url
  } catch (error) {
    console.error("Upload failed:", error)
    throw new Error("Failed to upload file")
  }
}

export async function deleteFile(url: string): Promise<void> {
  try {
    if (url.startsWith("/api/files/")) {
      const rel = sanitizeRelPath(url.slice("/api/files/".length))
      const abs = path.resolve(LOCAL_ROOT, rel)
      if (!abs.startsWith(path.resolve(LOCAL_ROOT))) return
      await unlink(abs).catch(() => {})
      return
    }
    await del(url)
  } catch (error) {
    console.error("Delete failed:", error)
    throw new Error("Failed to delete file")
  }
}

export async function uploadPhotoWithMetadata(
  file: File,
  organizationId: string,
  surveyId: string
): Promise<string> {
  const p = `organizations/${organizationId}/surveys/${surveyId}/photos/${Date.now()}`
  return uploadFile(file, p)
}

export async function uploadVoiceNote(
  file: File,
  organizationId: string,
  surveyId: string
): Promise<string> {
  const p = `organizations/${organizationId}/surveys/${surveyId}/voice/${Date.now()}`
  return uploadFile(file, p)
}
