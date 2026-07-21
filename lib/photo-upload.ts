// Client-side helper for uploading photos to a survey. Shared by the survey
// PhotoManager and the proposal editor's PhotoPicker so both get the same
// robust behaviour:
//  - HEIC (iPhone camera roll) is converted to JPEG in-browser so photos
//    display in every browser, not just Safari;
//  - files stream straight to Blob storage, bypassing Vercel's ~4.5MB
//    serverless body cap that broke large photos;
//  - a multipart fallback keeps local dev (no Blob) and small files working;
//  - error responses are read without assuming JSON (a non-JSON platform error
//    is what produced the opaque "string didn't match the expected pattern").

export type UploadedPhoto = {
  id: string
  fileUrl: string
  fileName: string
  caption: string | null
  order: number
  isCoverImage: boolean
  includeInProposal: boolean
  internalOnly: boolean
}

const isHeic = (f: File) => /image\/hei[cf]/i.test(f.type) || /\.(heic|heif)$/i.test(f.name)

const toJpegIfHeic = async (file: File): Promise<File> => {
  if (!isHeic(file)) return file
  try {
    const heic2any = (await import("heic2any")).default
    const out = await heic2any({ blob: file, toType: "image/jpeg", quality: 0.85 })
    const jpeg = Array.isArray(out) ? out[0] : out
    return new File([jpeg], file.name.replace(/\.(heic|heif)$/i, ".jpg"), { type: "image/jpeg" })
  } catch {
    return file // conversion failed - upload the original so the photo isn't lost
  }
}

const errorFrom = async (res: Response): Promise<string> => {
  try {
    const data = await res.json()
    return data.error || "Upload failed"
  } catch {
    return res.status === 413
      ? "Photo is too large to upload. Please try a smaller one."
      : "Upload failed"
  }
}

export async function uploadSurveyPhotos(
  surveyId: string,
  files: FileList | File[]
): Promise<UploadedPhoto[]> {
  // Convert any HEIC photos up front.
  const list: File[] = []
  for (const f of Array.from(files)) list.push(await toJpegIfHeic(f))

  // Fast path: stream each photo straight to Blob, then create the records.
  try {
    const { upload: blobUpload } = await import("@vercel/blob/client")
    const orgId = await fetch("/api/organization").then((r) => r.json()).then((o) => o.id)
    const uploaded: { url: string; fileName: string; fileSize: number }[] = []
    for (const f of list) {
      const blob = await blobUpload(
        `organizations/${orgId}/surveys/${surveyId}/photos/${Date.now()}-${f.name}`,
        f,
        { access: "public", handleUploadUrl: "/api/blob/upload" }
      )
      uploaded.push({ url: blob.url, fileName: f.name || "photo", fileSize: f.size })
    }
    const res = await fetch(`/api/surveys/${surveyId}/photos/from-blob`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ photos: uploaded }),
    })
    if (!res.ok) throw new Error(await errorFrom(res))
    return (await res.json()) as UploadedPhoto[]
  } catch (fastErr) {
    // Fall back to multipart only when it's safe (local dev, or small files) -
    // otherwise it would just hit the same size cap.
    const tooBig = list.some((f) => f.size > 4 * 1024 * 1024)
    if (tooBig && window.location.hostname !== "localhost") throw fastErr
  }

  const formData = new FormData()
  list.forEach((f) => formData.append("photos", f))
  const res = await fetch(`/api/surveys/${surveyId}/photos`, { method: "POST", body: formData })
  if (!res.ok) throw new Error(await errorFrom(res))
  return (await res.json()) as UploadedPhoto[]
}
