// Client-side "download all photos" — fetches each original and bundles them
// into a zip in the browser (a server route would blow Vercel's response cap
// on big photo sets). jszip is dynamically imported to stay off the main bundle.

type ZipPhoto = { fileUrl: string; fileName: string; caption?: string | null }

const sanitize = (s: string) =>
  s.replace(/[^a-z0-9 _-]+/gi, "").trim().replace(/\s+/g, "-").slice(0, 40)

export async function photosToZip(photos: ZipPhoto[]): Promise<{ blob: Blob; failed: number }> {
  const JSZip = (await import("jszip")).default
  const zip = new JSZip()
  let failed = 0

  await Promise.all(
    photos.map(async (p, i) => {
      try {
        const res = await fetch(p.fileUrl)
        if (!res.ok) throw new Error(`HTTP ${res.status}`)
        const blob = await res.blob()
        const ext = p.fileName.match(/\.[a-z0-9]+$/i)?.[0] || ".jpg"
        const base = sanitize(p.caption || p.fileName.replace(/\.[a-z0-9]+$/i, "")) || "photo"
        // Numbered prefix keeps survey order and avoids name collisions.
        zip.file(`${String(i + 1).padStart(2, "0")}-${base}${ext}`, blob)
      } catch {
        failed++
      }
    })
  )

  if (failed === photos.length) throw new Error("Couldn't fetch any of the photos")
  const blob = await zip.generateAsync({ type: "blob" })
  return { blob, failed }
}
