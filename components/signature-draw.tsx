"use client"

import { useRef, useState } from "react"
import { toast } from "sonner"
import { Loader2 } from "lucide-react"

// Draw-and-save signature pad for Settings (same scaling fix as the
// client acceptance pad - works on phones).
export function SignatureDraw({ onSaved }: { onSaved: (url: string) => void }) {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const drawing = useRef(false)
  const hasInk = useRef(false)
  const [saving, setSaving] = useState(false)

  const pos = (e: React.PointerEvent) => {
    const c = canvasRef.current!
    const rect = c.getBoundingClientRect()
    return {
      x: (e.clientX - rect.left) * (c.width / rect.width),
      y: (e.clientY - rect.top) * (c.height / rect.height),
    }
  }
  const start = (e: React.PointerEvent) => {
    drawing.current = true
    hasInk.current = true
    const ctx = canvasRef.current!.getContext("2d")!
    const p = pos(e)
    ctx.beginPath()
    ctx.moveTo(p.x, p.y)
  }
  const move = (e: React.PointerEvent) => {
    if (!drawing.current) return
    const ctx = canvasRef.current!.getContext("2d")!
    const p = pos(e)
    ctx.lineWidth = 2.5
    ctx.lineCap = "round"
    ctx.strokeStyle = "#0F172A"
    ctx.lineTo(p.x, p.y)
    ctx.stroke()
  }
  const end = () => (drawing.current = false)
  const clear = () => {
    const c = canvasRef.current!
    c.getContext("2d")!.clearRect(0, 0, c.width, c.height)
    hasInk.current = false
  }

  const save = async () => {
    if (!hasInk.current) {
      toast.error("Draw your signature first")
      return
    }
    setSaving(true)
    try {
      const blob: Blob = await new Promise((res, rej) =>
        canvasRef.current!.toBlob((b) => (b ? res(b) : rej(new Error("capture failed"))), "image/png")
      )
      const formData = new FormData()
      formData.append("file", new File([blob], "signature.png", { type: "image/png" }))
      formData.append("kind", "signature")
      const r = await fetch("/api/organization/logo", { method: "POST", body: formData })
      const data = await r.json()
      if (!r.ok) throw new Error(data.error)
      onSaved(data.url)
      clear()
      toast.success("Signature saved")
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed to save signature")
    } finally {
      setSaving(false)
    }
  }

  return (
    <div>
      <div className="border-2 border-dashed rounded-lg bg-gray-50 relative">
        <canvas ref={canvasRef} width={560} height={140}
          className="w-full touch-none cursor-crosshair"
          onPointerDown={start} onPointerMove={move} onPointerUp={end} onPointerLeave={end} />
        <span className="absolute bottom-1 left-2 text-[10px] text-gray-400 pointer-events-none">
          Sign with your finger or mouse
        </span>
      </div>
      <div className="flex gap-2 mt-2">
        <button type="button" onClick={save} disabled={saving}
          className="px-4 py-1.5 bg-brand-blue text-white rounded-lg text-xs font-semibold hover:bg-blue-700 disabled:opacity-50 inline-flex items-center gap-1.5">
          {saving && <Loader2 className="w-3 h-3 animate-spin" />} Save signature
        </button>
        <button type="button" onClick={clear}
          className="px-4 py-1.5 border rounded-lg text-xs font-medium text-gray-600 hover:bg-gray-50">
          Clear
        </button>
      </div>
    </div>
  )
}
