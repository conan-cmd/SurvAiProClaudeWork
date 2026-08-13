"use client"

import { useState } from "react"
import { useRouter } from "next/navigation"
import { toast } from "sonner"
import { GripVertical } from "lucide-react"

// Makes a list row reorderable: drag the grip handle onto another row and the
// dragged item takes that position (persisted via /api/reorder). Desktop only —
// the handle is hidden on touch layouts where HTML5 drag isn't supported.
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
  const mime = `text/x-survai-${kind}`

  return (
    <div
      className={`${className || ""} ${over ? "ring-2 ring-inset ring-brand-blue rounded-lg" : ""} ${busy ? "opacity-50" : ""}`}
      onDragOver={(e) => {
        if (e.dataTransfer.types.includes(mime)) {
          e.preventDefault()
          e.dataTransfer.dropEffect = "move"
          setOver(true)
        }
      }}
      onDragLeave={() => setOver(false)}
      onDrop={async (e) => {
        setOver(false)
        const draggedId = e.dataTransfer.getData(mime)
        if (!draggedId || draggedId === id) return
        e.preventDefault()
        setBusy(true)
        const res = await fetch("/api/reorder", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ kind, draggedId, beforeId: id }),
        })
        setBusy(false)
        if (res.ok) router.refresh()
        else toast.error("Couldn't move that — try again")
      }}
    >
      <span
        draggable
        onDragStart={(e) => {
          e.dataTransfer.setData(mime, id)
          e.dataTransfer.effectAllowed = "move"
        }}
        title="Drag to reorder"
        aria-label="Drag to reorder"
        className="hidden md:flex items-center self-stretch pl-1 pr-0.5 text-gray-300 hover:text-gray-500 cursor-grab active:cursor-grabbing shrink-0"
      >
        <GripVertical className="w-4 h-4" />
      </span>
      {children}
    </div>
  )
}
