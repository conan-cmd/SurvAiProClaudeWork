"use client"

import { useRef, useState } from "react"

// Wraps any upload UI so files can be dragged & dropped onto it (desktop).
// `accept` uses the same syntax as a file input's accept attribute; files that
// don't match are silently ignored. Click-to-upload behaviour of the wrapped
// children is untouched.
export function DropZone({
  onFiles,
  accept,
  disabled,
  className,
  children,
}: {
  onFiles: (files: FileList) => void
  accept?: string
  disabled?: boolean
  className?: string
  children: React.ReactNode
}) {
  const [over, setOver] = useState(false)
  // dragenter/leave fire for every child element — track depth so the overlay
  // doesn't flicker while moving across the zone.
  const depth = useRef(0)

  const matches = (f: File) => {
    if (!accept) return true
    return accept
      .split(",")
      .map((s) => s.trim().toLowerCase())
      .some((rule) => {
        if (!rule) return false
        if (rule.startsWith(".")) return f.name.toLowerCase().endsWith(rule)
        if (rule.endsWith("/*")) return f.type.toLowerCase().startsWith(rule.slice(0, -1))
        return f.type.toLowerCase() === rule
      })
  }

  return (
    <div
      className={`relative ${className || ""}`}
      onDragEnter={(e) => {
        e.preventDefault()
        if (!disabled) {
          depth.current++
          setOver(true)
        }
      }}
      onDragOver={(e) => e.preventDefault()}
      onDragLeave={(e) => {
        e.preventDefault()
        if (--depth.current <= 0) {
          depth.current = 0
          setOver(false)
        }
      }}
      onDrop={(e) => {
        e.preventDefault()
        depth.current = 0
        setOver(false)
        if (disabled) return
        const files = Array.from(e.dataTransfer.files).filter(matches)
        if (!files.length) return
        const dt = new DataTransfer()
        files.forEach((f) => dt.items.add(f))
        onFiles(dt.files)
      }}
    >
      {children}
      {over && !disabled && (
        <div className="absolute inset-0 z-10 rounded-xl border-2 border-dashed border-brand-blue bg-blue-50/85 flex items-center justify-center pointer-events-none">
          <span className="text-sm font-semibold text-brand-blue">Drop files to upload</span>
        </div>
      )}
    </div>
  )
}
