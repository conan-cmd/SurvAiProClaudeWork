"use client"

import { useEffect, useRef, useState } from "react"
import { useRouter } from "next/navigation"
import { toast } from "sonner"
import {
  MoreVertical, Pencil, Copy, Trash2, Loader2, Folder, FolderInput, Plus, Send, Check, ExternalLink,
} from "lucide-react"

type FolderOption = { id: string; name: string }

// Row action menu for survey/proposal lists: rename, duplicate, move to
// folder, delete. Sits alongside the row link; its clicks don't navigate.
export function ItemActions({
  kind,
  id,
  surveyId,
  title,
  proposalStatus,
}: {
  kind: "survey" | "proposal"
  id: string
  // For proposals, actions that target the job (rename/move) act on the survey.
  surveyId?: string
  title: string
  // Enables quick status actions (Mark as sent / Mark accepted) on proposal rows.
  proposalStatus?: string
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

  // Quick status changes without opening the editor. "Sent" covers proposals
  // delivered outside the app (printed, WhatsApp'd); "accepted" a verbal yes.
  const markSent = async () => {
    setOpen(false)
    setBusy(true)
    const res = await fetch(`/api/proposals/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status: "SENT" }),
    })
    setBusy(false)
    if (res.ok) {
      toast.success("Marked as sent")
      router.refresh()
    } else toast.error("Couldn't update status")
  }

  const markAccepted = async () => {
    setOpen(false)
    if (!window.confirm(`Mark "${title}" as won? Use this when the client has agreed verbally or on paper — it will show as Won but "Not signed".`)) return
    setBusy(true)
    const res = await fetch(`/api/proposals/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ markAccepted: true }),
    })
    setBusy(false)
    if (res.ok) {
      toast.success("Marked as won")
      router.refresh()
    } else {
      const d = await res.json().catch(() => ({}))
      toast.error(d.error || "Couldn't mark as won")
    }
  }

  // Manual CRM push — the automatic sync only fires on send / status changes.
  const pushToPipedrive = async () => {
    setOpen(false)
    setBusy(true)
    const res = await fetch(`/api/proposals/${id}/pipedrive-sync`, { method: "POST" })
    const d = await res.json().catch(() => ({}))
    setBusy(false)
    if (res.ok) toast.success("Pushed to Pipedrive — deal created/updated")
    else toast.error(d.error || "Couldn't push to Pipedrive")
  }

  const duplicate = async () => {
    setOpen(false)
    setBusy(true)
    // Surveys copy the job (details + photos); proposals also copy their
    // sections and pricing onto a fresh job.
    const path = kind === "survey" ? `/api/surveys/${id}/duplicate` : `/api/proposals/${id}/duplicate`
    const res = await fetch(path, { method: "POST" })
    setBusy(false)
    if (res.ok) {
      const data = await res.json()
      toast.success("Duplicated — check the site address")
      // Duplicated jobs usually need a new site: surveys land with the address
      // editor open; proposals open the copy (address editable on the cover).
      router.push(kind === "survey" ? `/surveys/${data.id}?editAddress=1` : `/proposals/${data.id}`)
    } else toast.error("Couldn't duplicate")
  }

  const remove = async () => {
    setOpen(false)
    // A survey is the parent record — deleting it cascades to the job's
    // proposal, RAMS and photos. A proposal delete removes only the proposal.
    const warning = kind === "survey"
      ? `Delete "${title}"? This deletes the whole job — including its proposal, RAMS and photos — and can't be undone.`
      : `Delete this proposal for "${title}"? The survey and any RAMS stay. This can't be undone.`
    if (!window.confirm(warning)) return
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
              {kind === "proposal" && ["DRAFT", "READY"].includes(proposalStatus || "") && (
                <button onClick={(e) => { e.preventDefault(); markSent() }} className={menuItem}
                  title="For proposals delivered outside the app — printed, WhatsApp'd, handed over">
                  <Send className="w-4 h-4" /> Mark as sent
                </button>
              )}
              {kind === "proposal" && ["DRAFT", "READY", "SENT"].includes(proposalStatus || "") && (
                <button onClick={(e) => { e.preventDefault(); markAccepted() }} className={menuItem}
                  title="Client agreed verbally or on paper — shows as Won, Not signed">
                  <Check className="w-4 h-4" /> Mark as won
                </button>
              )}
              <button onClick={(e) => { e.preventDefault(); rename() }} className={menuItem}>
                <Pencil className="w-4 h-4" /> Rename
              </button>
              <button onClick={(e) => { e.preventDefault(); duplicate() }} className={menuItem}
                title={kind === "proposal" ? "Copies the proposal (sections + pricing) onto a fresh job" : "Copies the job details and photos"}>
                <Copy className="w-4 h-4" /> Duplicate
              </button>
              {kind === "proposal" && (
                <button onClick={(e) => { e.preventDefault(); pushToPipedrive() }} className={menuItem}
                  title="Create/update the Pipedrive deal for this proposal (needs Pipedrive connected in Settings)">
                  <ExternalLink className="w-4 h-4" /> Push to Pipedrive
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
