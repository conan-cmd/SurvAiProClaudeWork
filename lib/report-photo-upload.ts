// Client-side photo upload for job reports — streams to Blob then creates records
// (mirrors lib/photo-upload for surveys, with iPhone HEIC → JPEG conversion).

export type ReportPhoto = { id: string; fileUrl: string; fileName: string; caption: string | null; order: number }

const isHeic = (f: File) => /image\/hei[cf]/i.test(f.type) || /\.(heic|heif)$/i.test(f.name)
const toJpegIfHeic = async (file: File): Promise<File> => {
  if (!isHeic(file)) return file
  try {
    const heic2any = (await import("heic2any")).default
    const out = await heic2any({ blob: file, toType: "image/jpeg", quality: 0.85 })
    const jpeg = Array.isArray(out) ? out[0] : out
    return new File([jpeg], file.name.replace(/\.(heic|heif)$/i, ".jpg"), { type: "image/jpeg" })
  } catch {
    return file
  }
}

export async function uploadJobReportPhotos(reportId: string, files: FileList | File[]): Promise<ReportPhoto[]> {
  const list: File[] = []
  for (const f of Array.from(files)) list.push(await toJpegIfHeic(f))

  const { upload: blobUpload } = await import("@vercel/blob/client")
  const orgId = await fetch("/api/organization").then((r) => r.json()).then((o) => o.id)
  const uploaded: { url: string; fileName: string; fileSize: number }[] = []
  for (const f of list) {
    const blob = await blobUpload(
      `organizations/${orgId}/job-reports/${reportId}/photos/${Date.now()}-${f.name}`,
      f,
      { access: "public", handleUploadUrl: "/api/blob/upload" }
    )
    uploaded.push({ url: blob.url, fileName: f.name || "photo", fileSize: f.size })
  }
  const res = await fetch(`/api/job-reports/${reportId}/photos/from-blob`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ photos: uploaded }),
  })
  if (!res.ok) throw new Error((await res.json().catch(() => ({}))).error || "Upload failed")
  return (await res.json()) as ReportPhoto[]
}
