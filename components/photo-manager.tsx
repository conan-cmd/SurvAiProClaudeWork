"use client"

import { useRef, useState } from "react"
import { toast } from "sonner"
import {
  Camera, Trash2, Star, ChevronUp, ChevronDown, EyeOff, Loader2,
} from "lucide-react"

export type Photo = {
  id: string
  fileUrl: string
  fileName: string
  caption: string | null
  order: number
  isCoverImage: boolean
  includeInProposal: boolean
  internalOnly: boolean
}

export function PhotoManager({
  surveyId,
  photos,
  onChange,
}: {
  surveyId: string
  photos: Photo[]
  onChange: (photos: Photo[]) => void
}) {
  const fileInput = useRef<HTMLInputElement>(null)
  const [uploading, setUploading] = useState(false)

  const upload = async (files: FileList | null) => {
    if (!files?.length) return
    setUploading(true)
    try {
      const formData = new FormData()
      Array.from(files).forEach((f) => formData.append("photos", f))
      const res = await fetch(`/api/surveys/${surveyId}/photos`, {
        method: "POST",
        body: formData,
      })
      if (!res.ok) throw new Error((await res.json()).error || "Upload failed")
      const created: Photo[] = await res.json()
      onChange([...photos, ...created])
      toast.success(`${created.length} photo${created.length > 1 ? "s" : ""} uploaded`)
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Upload failed")
    } finally {
      setUploading(false)
      if (fileInput.current) fileInput.current.value = ""
    }
  }

  const patch = async (photoId: string, data: Partial<Photo>) => {
    const prev = photos
    // Optimistic update
    let next = photos.map((p) => (p.id === photoId ? { ...p, ...data } : p))
    if (data.isCoverImage) {
      next = next.map((p) => (p.id === photoId ? p : { ...p, isCoverImage: false }))
    }
    onChange(next)
    const res = await fetch(`/api/surveys/${surveyId}/photos/${photoId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(data),
    })
    if (!res.ok) {
      onChange(prev)
      toast.error("Failed to save photo change")
    }
  }

  const remove = async (photoId: string) => {
    if (!confirm("Delete this photo?")) return
    const prev = photos
    onChange(photos.filter((p) => p.id !== photoId))
    const res = await fetch(`/api/surveys/${surveyId}/photos/${photoId}`, {
      method: "DELETE",
    })
    if (!res.ok) {
      onChange(prev)
      toast.error("Failed to delete photo")
    }
  }

  const move = async (index: number, direction: -1 | 1) => {
    const target = index + direction
    if (target < 0 || target >= photos.length) return
    const next = [...photos]
    ;[next[index], next[target]] = [next[target], next[index]]
    onChange(next)
    // Persist both orders
    await Promise.all([
      fetch(`/api/surveys/${surveyId}/photos/${next[index].id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ order: index }),
      }),
      fetch(`/api/surveys/${surveyId}/photos/${next[target].id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ order: target }),
      }),
    ])
  }

  return (
    <div className="space-y-4">
      <input
        ref={fileInput}
        type="file"
        accept="image/*"
        multiple
        capture="environment"
        className="hidden"
        onChange={(e) => upload(e.target.files)}
      />
      <button
        type="button"
        onClick={() => fileInput.current?.click()}
        disabled={uploading}
        className="w-full border-2 border-dashed border-gray-300 rounded-xl py-8 flex flex-col items-center gap-2 text-gray-500 hover:border-brand-blue hover:text-brand-blue transition disabled:opacity-50"
      >
        {uploading ? (
          <Loader2 className="w-8 h-8 animate-spin" />
        ) : (
          <Camera className="w-8 h-8" />
        )}
        <span className="font-medium">{uploading ? "Uploading…" : "Take or upload photos"}</span>
        <span className="text-xs">JPG, PNG, WebP or HEIC — up to 15MB each</span>
      </button>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        {photos.map((photo, index) => (
          <div key={photo.id} className="bg-white border rounded-xl overflow-hidden">
            <div className="relative">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={photo.fileUrl}
                alt={photo.caption || photo.fileName}
                className="w-full aspect-[4/3] object-cover"
              />
              {photo.isCoverImage && (
                <span className="absolute top-2 left-2 bg-brand-green text-white text-xs font-semibold px-2 py-0.5 rounded-full">
                  Cover
                </span>
              )}
              {photo.internalOnly && (
                <span className="absolute top-2 right-2 bg-gray-800/80 text-white text-xs font-semibold px-2 py-0.5 rounded-full flex items-center gap-1">
                  <EyeOff className="w-3 h-3" /> Internal
                </span>
              )}
            </div>
            <div className="p-3 space-y-2">
              <input
                defaultValue={photo.caption || ""}
                placeholder="Add a caption…"
                onBlur={(e) => {
                  if (e.target.value !== (photo.caption || "")) {
                    patch(photo.id, { caption: e.target.value })
                  }
                }}
                className="w-full text-sm px-3 py-1.5 border rounded-lg focus:outline-none focus:ring-1 focus:ring-brand-blue"
              />
              <div className="flex items-center justify-between text-gray-500">
                <div className="flex items-center gap-1">
                  <button type="button" title="Move up" onClick={() => move(index, -1)}
                    className="p-1.5 hover:bg-gray-100 rounded disabled:opacity-30" disabled={index === 0}>
                    <ChevronUp className="w-4 h-4" />
                  </button>
                  <button type="button" title="Move down" onClick={() => move(index, 1)}
                    className="p-1.5 hover:bg-gray-100 rounded disabled:opacity-30" disabled={index === photos.length - 1}>
                    <ChevronDown className="w-4 h-4" />
                  </button>
                  <button type="button" title="Mark as cover image"
                    onClick={() => patch(photo.id, { isCoverImage: !photo.isCoverImage })}
                    className={`p-1.5 hover:bg-gray-100 rounded ${photo.isCoverImage ? "text-brand-green" : ""}`}>
                    <Star className="w-4 h-4" fill={photo.isCoverImage ? "currentColor" : "none"} />
                  </button>
                  <button type="button" title="Internal only (never shown to client)"
                    onClick={() => patch(photo.id, { internalOnly: !photo.internalOnly })}
                    className={`p-1.5 hover:bg-gray-100 rounded ${photo.internalOnly ? "text-gray-900" : ""}`}>
                    <EyeOff className="w-4 h-4" />
                  </button>
                  <button type="button" title="Delete" onClick={() => remove(photo.id)}
                    className="p-1.5 hover:bg-red-50 hover:text-red-600 rounded">
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>
                <label className="flex items-center gap-1.5 text-xs font-medium cursor-pointer select-none">
                  <input
                    type="checkbox"
                    checked={photo.includeInProposal && !photo.internalOnly}
                    disabled={photo.internalOnly}
                    onChange={(e) => patch(photo.id, { includeInProposal: e.target.checked })}
                    className="rounded accent-blue-600"
                  />
                  In proposal
                </label>
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}
