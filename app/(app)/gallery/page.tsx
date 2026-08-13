"use client"

import { useEffect, useRef, useState } from "react"
import { toast } from "sonner"
import { Camera, Loader2, Trash2 } from "lucide-react"
import { DropZone } from "@/components/drop-zone"

type GalleryPhoto = {
  id: string
  fileUrl: string
  fileName: string
  caption: string | null
  tags: string | null
}

export default function GalleryPage() {
  const [photos, setPhotos] = useState<GalleryPhoto[] | null>(null)
  const [uploading, setUploading] = useState(false)
  const [tags, setTags] = useState("")
  const fileInput = useRef<HTMLInputElement>(null)

  useEffect(() => {
    fetch("/api/gallery")
      .then((r) => r.json())
      .then(setPhotos)
      .catch(() => toast.error("Failed to load gallery"))
  }, [])

  const upload = async (files: FileList | null) => {
    if (!files?.length) return
    if (!tags.trim()) {
      toast.error("Add service tags first (e.g. roof cleaning) so proposals can match these photos")
      return
    }
    setUploading(true)
    try {
      const formData = new FormData()
      Array.from(files).forEach((f) => formData.append("photos", f))
      formData.append("tags", tags)
      const res = await fetch("/api/gallery", { method: "POST", body: formData })
      if (!res.ok) throw new Error((await res.json()).error)
      const created = await res.json()
      setPhotos((p) => [...created, ...(p || [])])
      toast.success(`${created.length} photo${created.length > 1 ? "s" : ""} added to your gallery`)
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Upload failed")
    } finally {
      setUploading(false)
      if (fileInput.current) fileInput.current.value = ""
    }
  }

  const patch = async (id: string, data: Partial<GalleryPhoto>) => {
    const res = await fetch(`/api/gallery/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(data),
    })
    if (!res.ok) toast.error("Failed to save")
    else {
      const updated = await res.json()
      setPhotos((p) => (p || []).map((x) => (x.id === id ? updated : x)))
    }
  }

  const remove = async (id: string) => {
    if (!confirm("Remove this photo from your gallery?")) return
    const res = await fetch(`/api/gallery/${id}`, { method: "DELETE" })
    if (!res.ok) toast.error("Failed to delete")
    else setPhotos((p) => (p || []).filter((x) => x.id !== id))
  }

  const inputCls =
    "w-full text-sm px-3 py-1.5 border rounded-lg focus:outline-none focus:ring-1 focus:ring-brand-blue"

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-brand-navy">Project gallery</h1>
        <p className="text-gray-500 text-sm">
          Your best before-and-after shots. SurvAIPro automatically adds matching examples
          to proposals for similar jobs.
        </p>
      </div>

      <div className="bg-white rounded-xl shadow-sm p-5 space-y-3">
        <label className="block text-sm font-medium text-gray-700">
          Service tags for this upload (comma separated)
        </label>
        <input className={inputCls} placeholder="e.g. roof cleaning, moss removal"
          value={tags} onChange={(e) => setTags(e.target.value)} />
        <input ref={fileInput} type="file" accept="image/*" multiple className="hidden"
          onChange={(e) => upload(e.target.files)} />
        <DropZone onFiles={upload} accept="image/*,.heic,.heif" disabled={uploading}>
          <button type="button" onClick={() => fileInput.current?.click()} disabled={uploading}
            className="w-full border-2 border-dashed border-gray-300 rounded-xl py-6 flex flex-col items-center gap-2 text-gray-500 hover:border-brand-blue hover:text-brand-blue transition disabled:opacity-50">
            {uploading ? <Loader2 className="w-7 h-7 animate-spin" /> : <Camera className="w-7 h-7" />}
            <span className="font-medium">{uploading ? "Uploading…" : "Upload before/after photos"}</span>
            <span className="text-xs">Drag &amp; drop works too</span>
          </button>
        </DropZone>
      </div>

      {!photos ? (
        <div className="flex justify-center py-10">
          <Loader2 className="w-7 h-7 animate-spin text-brand-blue" />
        </div>
      ) : photos.length === 0 ? (
        <p className="text-center text-gray-400 py-8">
          No gallery photos yet. Save your favourite job photos from your phone, Facebook or
          Instagram and upload them here once.
        </p>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {photos.map((photo) => (
            <div key={photo.id} className="bg-white border rounded-xl overflow-hidden">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={photo.fileUrl} alt={photo.caption || photo.fileName}
                className="w-full aspect-[4/3] object-cover" />
              <div className="p-3 space-y-2">
                <input defaultValue={photo.caption || ""} placeholder="Caption (shown on proposals)"
                  onBlur={(e) => e.target.value !== (photo.caption || "") && patch(photo.id, { caption: e.target.value })}
                  className={inputCls} />
                <div className="flex gap-2">
                  <input defaultValue={photo.tags || ""} placeholder="Tags"
                    onBlur={(e) => e.target.value !== (photo.tags || "") && patch(photo.id, { tags: e.target.value })}
                    className={inputCls} />
                  <button onClick={() => remove(photo.id)}
                    className="p-2 text-gray-400 hover:text-red-600 hover:bg-red-50 rounded-lg shrink-0">
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
