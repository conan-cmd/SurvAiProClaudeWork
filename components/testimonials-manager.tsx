"use client"

import { useEffect, useRef, useState } from "react"
import { toast } from "sonner"
import { Loader2, Star, Search, Plus, Trash2, Video, Quote, Download } from "lucide-react"
import { DropZone } from "@/components/drop-zone"

export type Testimonial = {
  id: string
  kind: string
  title: string | null
  text: string | null
  author: string | null
  rating: number | null
  fileUrl: string | null
  youtubeUrl: string | null
  source: string
  serviceTags: string | null
  audience: string
}

type PlaceHit = { placeId: string; name: string; address: string; rating: number | null; totalReviews: number | null }
type PlaceReview = { author: string; rating: number; text: string; when: string }

const inputCls = "w-full px-3 py-2 border rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-brand-blue"

function Stars({ n }: { n: number | null }) {
  if (!n) return null
  return (
    <span className="inline-flex text-amber-400" aria-label={`${n} stars`}>
      {Array.from({ length: 5 }, (_, i) => (
        <Star key={i} className={`w-3.5 h-3.5 ${i < n ? "fill-current" : "opacity-25"}`} />
      ))}
    </span>
  )
}

// Settings section: import Google reviews, upload testimonial videos, tag both
// by service + property type so matching proposals suggest them automatically.
export function TestimonialsManager({ orgId }: { orgId: string }) {
  const [items, setItems] = useState<Testimonial[] | null>(null)
  const [query, setQuery] = useState("")
  const [searching, setSearching] = useState(false)
  const [hits, setHits] = useState<PlaceHit[] | null>(null)
  const [connectedName, setConnectedName] = useState<string | null>(null)
  const [gReviews, setGReviews] = useState<PlaceReview[]>([])
  const [importing, setImporting] = useState<number | null>(null)
  const [addOpen, setAddOpen] = useState<"review" | "video" | null>(null)
  const [saving, setSaving] = useState(false)
  const [uploadingVideo, setUploadingVideo] = useState(false)
  const videoInput = useRef<HTMLInputElement>(null)
  const [form, setForm] = useState({ title: "", author: "", rating: 5, text: "", youtubeUrl: "", fileUrl: "", serviceTags: "", audience: "ANY" })
  const set = (k: string, v: string | number) => setForm((p) => ({ ...p, [k]: v }))
  const saveTimers = useRef<Record<string, ReturnType<typeof setTimeout>>>({})

  useEffect(() => {
    fetch("/api/testimonials").then((r) => r.json()).then((d) => setItems(Array.isArray(d) ? d : [])).catch(() => setItems([]))
    fetch("/api/google-reviews").then((r) => r.json())
      .then((d) => { if (d.connected) { setConnectedName(d.name); setGReviews(d.reviews || []) } })
      .catch(() => {})
  }, [])

  const search = async () => {
    if (!query.trim()) return
    setSearching(true)
    try {
      const d = await fetch(`/api/google-reviews?q=${encodeURIComponent(query)}`).then((r) => r.json())
      setHits(Array.isArray(d.results) ? d.results : [])
    } catch {
      toast.error("Search failed")
    } finally {
      setSearching(false)
    }
  }

  const connect = async (placeId: string) => {
    setSearching(true)
    try {
      const res = await fetch("/api/google-reviews", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ placeId }),
      })
      const d = await res.json()
      if (!res.ok) throw new Error(d.error)
      setConnectedName(d.name)
      setGReviews(d.reviews || [])
      setHits(null)
      toast.success(`Connected to ${d.name} on Google`)
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Couldn't connect")
    } finally {
      setSearching(false)
    }
  }

  const importReview = async (r: PlaceReview, i: number) => {
    setImporting(i)
    try {
      const res = await fetch("/api/testimonials", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ kind: "review", text: r.text, author: r.author, rating: r.rating, source: "google", title: `Google review — ${r.author}` }),
      })
      const d = await res.json()
      if (!res.ok) throw new Error(d.error)
      setItems((x) => (x ? [d, ...x] : [d]))
      toast.success("Imported — now tag it with the services it mentions")
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Couldn't import")
    } finally {
      setImporting(null)
    }
  }

  const uploadVideo = async (files: FileList | null) => {
    const file = files?.[0]
    if (!file) return
    setUploadingVideo(true)
    try {
      const { upload } = await import("@vercel/blob/client")
      const blob = await upload(`organizations/${orgId}/testimonials/${Date.now()}-${file.name}`, file, {
        access: "public",
        handleUploadUrl: "/api/blob/upload",
      })
      set("fileUrl", blob.url)
      toast.success("Video uploaded — add a title and tags, then Save")
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Upload failed")
    } finally {
      setUploadingVideo(false)
      if (videoInput.current) videoInput.current.value = ""
    }
  }

  const saveNew = async () => {
    if (!addOpen) return
    setSaving(true)
    try {
      const body =
        addOpen === "review"
          ? { kind: "review", title: form.title || undefined, author: form.author || undefined, rating: form.rating, text: form.text, serviceTags: form.serviceTags || undefined, audience: form.audience }
          : { kind: "video", title: form.title || undefined, fileUrl: form.fileUrl || undefined, youtubeUrl: form.youtubeUrl || undefined, serviceTags: form.serviceTags || undefined, audience: form.audience }
      const res = await fetch("/api/testimonials", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      })
      const d = await res.json()
      if (!res.ok) throw new Error(d.error)
      setItems((x) => (x ? [d, ...x] : [d]))
      setAddOpen(null)
      setForm({ title: "", author: "", rating: 5, text: "", youtubeUrl: "", fileUrl: "", serviceTags: "", audience: "ANY" })
      toast.success("Testimonial added")
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Couldn't save")
    } finally {
      setSaving(false)
    }
  }

  const patchItem = (id: string, patch: Partial<Testimonial>) => {
    setItems((x) => (x ? x.map((t) => (t.id === id ? { ...t, ...patch } : t)) : x))
    if (saveTimers.current[id]) clearTimeout(saveTimers.current[id])
    saveTimers.current[id] = setTimeout(async () => {
      const res = await fetch(`/api/testimonials/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(patch),
      })
      if (!res.ok) toast.error("Couldn't save the change")
    }, 700)
  }

  const remove = async (id: string) => {
    if (!confirm("Remove this testimonial? Proposals that already include it keep their copy.")) return
    const res = await fetch(`/api/testimonials/${id}`, { method: "DELETE" })
    if (res.ok) setItems((x) => (x ? x.filter((t) => t.id !== id) : x))
    else toast.error("Couldn't delete")
  }

  const alreadyImported = (r: PlaceReview) => items?.some((t) => t.source === "google" && t.text === r.text)

  return (
    <section className="bg-white rounded-xl shadow-sm p-5 space-y-4">
      <h2 className="font-semibold text-brand-navy">Reviews &amp; testimonials</h2>
      <p className="text-sm text-gray-500">
        Tag each one with the services it mentions — proposals for matching jobs automatically suggest
        them in a &ldquo;What Our Customers Say&rdquo; section.
      </p>

      {/* Google reviews */}
      <div className="rounded-lg border p-3 space-y-2">
        <p className="text-sm font-medium text-gray-700">
          Google reviews {connectedName && <span className="text-emerald-600">— connected to {connectedName}</span>}
        </p>
        {!connectedName && (
          <>
            <div className="flex gap-2">
              <input className={inputCls} value={query} placeholder="Search your business, e.g. LBC Clean Luton"
                onChange={(e) => setQuery(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && search()} />
              <button onClick={search} disabled={searching}
                className="shrink-0 inline-flex items-center gap-1.5 px-3 py-2 border rounded-lg text-sm font-medium hover:bg-gray-50 disabled:opacity-50">
                {searching ? <Loader2 className="w-4 h-4 animate-spin" /> : <Search className="w-4 h-4" />} Find
              </button>
            </div>
            {hits && (
              <ul className="divide-y border rounded-lg">
                {hits.length === 0 && <li className="p-3 text-sm text-gray-400">No matches — try adding your town.</li>}
                {hits.map((h) => (
                  <li key={h.placeId} className="p-3 flex items-center justify-between gap-3">
                    <div className="min-w-0">
                      <div className="text-sm font-medium truncate">{h.name}</div>
                      <div className="text-xs text-gray-400 truncate">
                        {h.address}{h.rating ? ` · ★ ${h.rating} (${h.totalReviews ?? "?"} reviews)` : ""}
                      </div>
                    </div>
                    <button onClick={() => connect(h.placeId)} disabled={searching}
                      className="shrink-0 px-3 py-1.5 bg-brand-blue text-white rounded-lg text-sm font-semibold hover:bg-blue-700 disabled:opacity-50">
                      Connect
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </>
        )}
        {connectedName && (
          <>
            <p className="text-xs text-gray-400">
              Google shares your 5 most relevant reviews — import the ones worth showing, then tag them.
            </p>
            <ul className="space-y-2">
              {gReviews.map((r, i) => (
                <li key={i} className="border rounded-lg p-3 text-sm">
                  <div className="flex items-center justify-between gap-2">
                    <span className="font-medium">{r.author} <span className="text-gray-400 font-normal">· {r.when}</span></span>
                    <Stars n={r.rating} />
                  </div>
                  <p className="text-gray-600 text-xs mt-1 line-clamp-3">{r.text}</p>
                  <button onClick={() => importReview(r, i)} disabled={importing !== null || alreadyImported(r)}
                    className="mt-2 inline-flex items-center gap-1.5 text-xs font-semibold text-brand-blue hover:underline disabled:opacity-40 disabled:no-underline">
                    {importing === i ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Download className="w-3.5 h-3.5" />}
                    {alreadyImported(r) ? "Imported" : "Import"}
                  </button>
                </li>
              ))}
              {gReviews.length === 0 && <li className="text-sm text-gray-400">No reviews returned by Google yet.</li>}
            </ul>
          </>
        )}
      </div>

      {/* Add manual */}
      <div className="flex flex-wrap gap-2">
        <button onClick={() => setAddOpen(addOpen === "review" ? null : "review")}
          className="inline-flex items-center gap-1.5 px-3 py-2 border rounded-lg text-sm font-medium hover:bg-gray-50">
          <Quote className="w-4 h-4" /> Add written review
        </button>
        <button onClick={() => setAddOpen(addOpen === "video" ? null : "video")}
          className="inline-flex items-center gap-1.5 px-3 py-2 border rounded-lg text-sm font-medium hover:bg-gray-50">
          <Video className="w-4 h-4" /> Add testimonial video
        </button>
      </div>

      {addOpen && (
        <div className="border rounded-lg p-3 space-y-2.5">
          <input className={inputCls} value={form.title} placeholder="Label, e.g. Residential roof clean — Mrs Smith"
            onChange={(e) => set("title", e.target.value)} />
          {addOpen === "review" ? (
            <>
              <div className="grid grid-cols-2 gap-2">
                <input className={inputCls} value={form.author} placeholder="Customer name"
                  onChange={(e) => set("author", e.target.value)} />
                <select className={`${inputCls} bg-white`} value={form.rating}
                  onChange={(e) => set("rating", Number(e.target.value))}>
                  {[5, 4, 3].map((n) => <option key={n} value={n}>{"★".repeat(n)} ({n})</option>)}
                </select>
              </div>
              <textarea spellCheck rows={3} className={inputCls} value={form.text} placeholder="The review text…"
                onChange={(e) => set("text", e.target.value)} />
            </>
          ) : (
            <>
              <DropZone onFiles={uploadVideo} accept="video/*" disabled={uploadingVideo}>
                <button type="button" onClick={() => videoInput.current?.click()} disabled={uploadingVideo}
                  className="w-full border-2 border-dashed border-gray-300 rounded-lg py-4 text-sm text-gray-500 hover:border-brand-blue hover:text-brand-blue inline-flex items-center justify-center gap-2 disabled:opacity-50">
                  {uploadingVideo ? <Loader2 className="w-4 h-4 animate-spin" /> : <Video className="w-4 h-4" />}
                  {form.fileUrl ? "Video uploaded ✓ — replace?" : uploadingVideo ? "Uploading…" : "Upload video file (or drop it here)"}
                </button>
              </DropZone>
              <input ref={videoInput} type="file" accept="video/*" className="hidden"
                onChange={(e) => uploadVideo(e.target.files)} />
              <input className={inputCls} value={form.youtubeUrl} placeholder="…or paste a YouTube link"
                onChange={(e) => set("youtubeUrl", e.target.value)} />
            </>
          )}
          <input className={inputCls} value={form.serviceTags}
            placeholder="Service tags, e.g. roof cleaning, moss removal"
            onChange={(e) => set("serviceTags", e.target.value)} />
          <select className={`${inputCls} bg-white`} value={form.audience} onChange={(e) => set("audience", e.target.value)}>
            <option value="ANY">Any property type</option>
            <option value="RESIDENTIAL">Residential jobs only</option>
            <option value="COMMERCIAL">Commercial jobs only</option>
          </select>
          <div className="flex justify-end gap-2">
            <button onClick={() => setAddOpen(null)} className="px-3 py-2 border rounded-lg text-sm font-medium hover:bg-gray-50">Cancel</button>
            <button onClick={saveNew} disabled={saving}
              className="inline-flex items-center gap-1.5 px-4 py-2 bg-brand-blue text-white rounded-lg text-sm font-semibold hover:bg-blue-700 disabled:opacity-50">
              {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Plus className="w-4 h-4" />} Save
            </button>
          </div>
        </div>
      )}

      {/* Library */}
      {items === null ? (
        <div className="flex justify-center py-4"><Loader2 className="w-5 h-5 animate-spin text-brand-blue" /></div>
      ) : items.length > 0 && (
        <ul className="space-y-2">
          {items.map((t) => (
            <li key={t.id} className="border rounded-lg p-3">
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0 text-sm">
                  <div className="font-medium flex items-center gap-1.5">
                    {t.kind === "video" ? <Video className="w-3.5 h-3.5 text-gray-400" /> : <Quote className="w-3.5 h-3.5 text-gray-400" />}
                    <span className="truncate">{t.title || t.author || "Untitled"}</span>
                    {t.source === "google" && <span className="text-[10px] font-semibold px-1.5 py-0.5 rounded-full bg-blue-50 text-brand-blue shrink-0">Google</span>}
                    <Stars n={t.rating} />
                  </div>
                  {t.text && <p className="text-xs text-gray-500 mt-1 line-clamp-2">{t.text}</p>}
                </div>
                <button onClick={() => remove(t.id)} aria-label="Delete" className="p-1 text-gray-300 hover:text-red-500 shrink-0">
                  <Trash2 className="w-4 h-4" />
                </button>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 mt-2">
                <input className="px-2.5 py-1.5 border rounded-lg text-xs focus:outline-none focus:ring-1 focus:ring-brand-blue"
                  value={t.serviceTags || ""} placeholder="Service tags, e.g. roof cleaning"
                  onChange={(e) => patchItem(t.id, { serviceTags: e.target.value })} />
                <select className="px-2.5 py-1.5 border rounded-lg text-xs bg-white focus:outline-none focus:ring-1 focus:ring-brand-blue"
                  value={t.audience} onChange={(e) => patchItem(t.id, { audience: e.target.value })}>
                  <option value="ANY">Any property type</option>
                  <option value="RESIDENTIAL">Residential only</option>
                  <option value="COMMERCIAL">Commercial only</option>
                </select>
              </div>
            </li>
          ))}
        </ul>
      )}
    </section>
  )
}
