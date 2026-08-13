"use client"

import { useRef, useState } from "react"
import { useRouter } from "next/navigation"
import { toast } from "sonner"
import { GripVertical } from "lucide-react"

const HIGHLIGHT = ["ring-2", "ring-inset", "ring-brand-blue", "rounded-lg"]

// Makes a list row reorderable: drag the grip handle onto another row and the
// dragged item takes that position (persisted via /api/reorder).
// Desktop uses HTML5 drag & drop; touch devices get a finger-drag on the same
// handle (touch-action:none on the handle keeps it from scrolling the page).
export function DraggableRow({
  kind,
  id,
  className,
  children,
}: {
  kind: "survey" | "proposal" | "rams"
  id: string
  className?: string
  children: React.ReactNode
}) {
  const router = useRouter()
  const [over, setOver] = useState(false)
  const [busy, setBusy] = useState(false)
  const [dragging, setDragging] = useState(false)
  // Row currently highlighted as the drop target during a touch drag.
  const touchTarget = useRef<HTMLElement | null>(null)
  const mime = `text/x-survai-${kind}`

  const reorder = async (draggedId: string, beforeId: string) => {
    if (draggedId === beforeId) return
    setBusy(true)
    const res = await fetch("/api/reorder", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ kind, draggedId, beforeId }),
    })
    setBusy(false)
    if (res.ok) router.refresh()
    else toast.error("Couldn't move that — try again")
  }

  const clearTouchTarget = () => {
    touchTarget.current?.classList.remove(...HIGHLIGHT)
    touchTarget.current = null
  }

  return (
    <div
      data-drag-kind={kind}
      data-drag-id={id}
      className={`${className || ""} ${over ? "ring-2 ring-inset ring-brand-blue rounded-lg" : ""} ${busy || dragging ? "opacity-50" : ""}`}
      onDragOver={(e) => {
        if (e.dataTransfer.types.includes(mime)) {
          e.preventDefault()
          e.dataTransfer.dropEffect = "move"
          setOver(true)
        }
      }}
      onDragLeave={() => setOver(false)}
      onDrop={(e) => {
        setOver(false)
        const draggedId = e.dataTransfer.getData(mime)
        if (!draggedId || draggedId === id) return
        e.preventDefault()
        reorder(draggedId, id)
      }}
    >
      <span
        draggable
        onDragStart={(e) => {
          e.dataTransfer.setData(mime, id)
          e.dataTransfer.effectAllowed = "move"
        }}
        onTouchStart={() => setDragging(true)}
        onTouchMove={(e) => {
          const t = e.touches[0]
          const el = document.elementFromPoint(t.clientX, t.clientY)
          const row = (el?.closest(`[data-drag-kind="${kind}"]`) as HTMLElement | null) || null
          if (row !== touchTarget.current) {
            clearTouchTarget()
            if (row && row.dataset.dragId !== id) {
              row.classList.add(...HIGHLIGHT)
              touchTarget.current = row
            }
          }
        }}
        onTouchEnd={() => {
          setDragging(false)
          const targetId = touchTarget.current?.dataset.dragId
          clearTouchTarget()
          if (targetId) reorder(id, targetId)
        }}
        onTouchCancel={() => {
          setDragging(false)
          clearTouchTarget()
        }}
        style={{ touchAction: "none" }}
        title="Drag to reorder"
        aria-label="Drag to reorder"
        className="flex items-center self-stretch pl-1.5 pr-1 text-gray-300 hover:text-gray-500 cursor-grab active:cursor-grabbing shrink-0"
      >
        <GripVertical className="w-4 h-4" />
      </span>
      {children}
    </div>
  )
}
