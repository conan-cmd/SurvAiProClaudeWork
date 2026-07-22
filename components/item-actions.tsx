"use client"

import { useEffect, useRef, useState } from "react"
import { useRouter } from "next/navigation"
import { toast } from "sonner"
import {
  MoreVertical, Pencil, Copy, Trash2, Loader2, Folder, FolderInput, Plus,
} from "lucide-react"

type FolderOption = { id: string; name: string }

// Row action menu for survey/proposal lists: rename, duplicate (surveys),
// move to folder, delete. Sits alongside the row link; its clicks don't navigate.
export function ItemActions({
  kind,
  id,
  surveyId,
  title,
}: {
  kind: "survey" | "proposal"
  id: string
  // For proposals, actions that target the job (rename/move) act on the survey.
  surveyId?: string
  title: string
}) {
  const router = useRouter()
  const [open, setOpen] = useState(false)
  const [busy, setBusy] = useState(false)
  const [showFolders, setShowFolders] = useState(false)
  const [folders, setFolders] = useState<FolderOption[] | null>(null)
  const ref = useRef<HTMLDivElement>(null)

  const targetSurvey = kind === "survey" ? id : surveyId

  useEffect(() => {
    const onDoc = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        setOpen(false)
        setShowFolders(false)
      }
    }
    document.addEventListener("mousedown", onDoc)
    return () => document.removeEventListener("mousedown", onDoc)
  }, [])

  const rename = async () => {
    setOpen(false)
    const next = window.prompt("Rename to:", title)
    if (next === null || !next.trim() || next.trim() === title || !targetSurvey) return
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

  const openFolders = async () => {
    setShowFolders(true)
    if (folders === null) {
      try {
        const res = await fetch("/api/folders")
        setFolders(res.ok ? await res.json() : [])
      } catch {
        setFolders([])
      }
    }
  }

  const moveTo = async (folderId: string | null) => {
    if (!targetSurvey) return
    setOpen(false)
    setShowFolders(false)
    setBusy(true)
    const res = await fetch(`/api/surveys/${targetSurvey}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ folderId }),
    })
    setBusy(false)
    if (res.ok) {
      toast.success(folderId ? "Moved to folder" : "Removed from folder")
      router.refresh()
    } else toast.error("Couldn't move")
  }

  const newFolderAndMove = async () => {
    const name = window.prompt("New folder name:")
    if (name === null || !name.trim()) return
    setBusy(true)
    const res = await fetch("/api/folders", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: name.trim() }),
    })
    if (!res.ok) {
      setBusy(false)
      toast.error("Couldn't create folder")
      return
    }
    const folder = await res.json()
    await moveTo(folder.id)
  }

  const menuItem = "w-full text-left px-3 py-2 hover:bg-gray-50 flex items-center gap-2"

  return (
    <div className="relative shrink-0" ref={ref}>
      <button
        type="button"
        onClick={(e) => {
          e.preventDefault()
          e.stopPropagation()
          setShowFolders(false)
          setOpen((o) => !o)
        }}
        disabled={busy}
        aria-label="Actions"
        className="p-1.5 rounded-md text-gray-400 hover:bg-gray-100 hover:text-gray-700 disabled:opacity-50"
      >
        {busy ? <Loader2 className="w-4 h-4 animate-spin" /> : <MoreVertical className="w-4 h-4" />}
      </button>
      {open && (
        <div className="absolute right-0 top-full mt-1 w-48 bg-white border rounded-lg shadow-lg py-1 z-30 text-sm">
          {!showFolders ? (
            <>
              <button onClick={(e) => { e.preventDefault(); rename() }} className={menuItem}>
                <Pencil className="w-4 h-4" /> Rename
              </button>
              {kind === "survey" && (
                <button onClick={(e) => { e.preventDefault(); duplicate() }} className={menuItem}>
                  <Copy className="w-4 h-4" /> Duplicate
                </button>
              )}
              {targetSurvey && (
                <button onClick={(e) => { e.preventDefault(); openFolders() }} className={menuItem}>
                  <FolderInput className="w-4 h-4" /> Move to folder
                </button>
              )}
              <button onClick={(e) => { e.preventDefault(); remove() }}
                className="w-full text-left px-3 py-2 hover:bg-red-50 text-red-600 flex items-center gap-2">
                <Trash2 className="w-4 h-4" /> Delete
              </button>
            </>
          ) : (
            <>
              <div className="px-3 py-1.5 text-xs text-gray-400">Move to…</div>
              {folders === null ? (
                <div className="px-3 py-2 text-gray-400 flex items-center gap-2">
                  <Loader2 className="w-4 h-4 animate-spin" /> Loading…
                </div>
              ) : (
                <>
                  {folders.map((f) => (
                    <button key={f.id} onClick={(e) => { e.preventDefault(); moveTo(f.id) }} className={menuItem}>
                      <Folder className="w-4 h-4" /> <span className="truncate">{f.name}</span>
                    </button>
                  ))}
                  <button onClick={(e) => { e.preventDefault(); newFolderAndMove() }}
                    className={`${menuItem} text-brand-blue`}>
                    <Plus className="w-4 h-4" /> New folder…
                  </button>
                  <button onClick={(e) => { e.preventDefault(); moveTo(null) }}
                    className={`${menuItem} text-gray-500`}>
                    Remove from folder
                  </button>
                </>
              )}
            </>
          )}
        </div>
      )}
    </div>
  )
}
