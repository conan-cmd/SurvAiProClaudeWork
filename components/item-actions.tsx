"use client"

import { useEffect, useRef, useState } from "react"
import { useRouter } from "next/navigation"
import { toast } from "sonner"
import { MoreVertical, Pencil, Copy, Trash2, Loader2 } from "lucide-react"

// Row action menu for survey/proposal lists: rename, duplicate (surveys), delete.
// Sits alongside the row link; its clicks don't navigate.
export function ItemActions({
  kind,
  id,
  surveyId,
  title,
}: {
  kind: "survey" | "proposal"
  id: string
  // For proposals, the title shown is the linked survey's title, so rename edits it.
  surveyId?: string
  title: string
}) {
  const router = useRouter()
  const [open, setOpen] = useState(false)
  const [busy, setBusy] = useState(false)
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const onDoc = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener("mousedown", onDoc)
    return () => document.removeEventListener("mousedown", onDoc)
  }, [])

  const rename = async () => {
    setOpen(false)
    const next = window.prompt("Rename to:", title)
    if (next === null || !next.trim() || next.trim() === title) return
    const targetSurvey = kind === "survey" ? id : surveyId
    if (!targetSurvey) return
    setBusy(true)
    const res = await fetch(`/api/surveys/${targetSurvey}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ title: next.trim() }),
    })
    setBusy(false)
    if (res.ok) {
      toast.success("Renamed")
      router.refresh()
    } else toast.error("Couldn't rename")
  }

  const duplicate = async () => {
    setOpen(false)
    setBusy(true)
    const res = await fetch(`/api/surveys/${id}/duplicate`, { method: "POST" })
    setBusy(false)
    if (res.ok) {
      const data = await res.json()
      toast.success("Duplicated")
      router.push(`/surveys/${data.id}`)
    } else toast.error("Couldn't duplicate")
  }

  const remove = async () => {
    setOpen(false)
    if (!window.confirm(`Delete "${title}"? This can't be undone.`)) return
    setBusy(true)
    const path = kind === "survey" ? `/api/surveys/${id}` : `/api/proposals/${id}`
    const res = await fetch(path, { method: "DELETE" })
    setBusy(false)
    if (res.ok) {
      toast.success("Deleted")
      router.refresh()
    } else toast.error("Couldn't delete")
  }

  return (
    <div className="relative shrink-0" ref={ref}>
      <button
        type="button"
        onClick={(e) => {
          e.preventDefault()
          e.stopPropagation()
          setOpen((o) => !o)
        }}
        disabled={busy}
        aria-label="Actions"
        className="p-1.5 rounded-md text-gray-400 hover:bg-gray-100 hover:text-gray-700 disabled:opacity-50"
      >
        {busy ? <Loader2 className="w-4 h-4 animate-spin" /> : <MoreVertical className="w-4 h-4" />}
      </button>
      {open && (
        <div className="absolute right-0 top-full mt-1 w-40 bg-white border rounded-lg shadow-lg py-1 z-30 text-sm">
          <button
            onClick={(e) => { e.preventDefault(); rename() }}
            className="w-full text-left px-3 py-2 hover:bg-gray-50 flex items-center gap-2"
          >
            <Pencil className="w-4 h-4" /> Rename
          </button>
          {kind === "survey" && (
            <button
              onClick={(e) => { e.preventDefault(); duplicate() }}
              className="w-full text-left px-3 py-2 hover:bg-gray-50 flex items-center gap-2"
            >
              <Copy className="w-4 h-4" /> Duplicate
            </button>
          )}
          <button
            onClick={(e) => { e.preventDefault(); remove() }}
            className="w-full text-left px-3 py-2 hover:bg-red-50 text-red-600 flex items-center gap-2"
          >
            <Trash2 className="w-4 h-4" /> Delete
          </button>
        </div>
      )}
    </div>
  )
}
