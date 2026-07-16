import { put, del } from "@vercel/blob"

export async function uploadFile(file: File, path: string): Promise<string> {
  try {
    // Vercel Blob only supports public access; addRandomSuffix makes the URL
    // unguessable, and org-scoped paths keep tenants separated.
    const blob = await put(path, file, {
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
  const path = `organizations/${organizationId}/surveys/${surveyId}/photos/${Date.now()}`
  return uploadFile(file, path)
}

export async function uploadVoiceNote(
  file: File,
  organizationId: string,
  surveyId: string
): Promise<string> {
  const path = `organizations/${organizationId}/surveys/${surveyId}/voice/${Date.now()}`
  return uploadFile(file, path)
}
