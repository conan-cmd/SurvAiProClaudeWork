"use client"

import { useRef, useState } from "react"
import { CheckCircle2 } from "lucide-react"
import { formatCurrency } from "@/lib/utils"

type OptionalItem = { id: string; description: string; amount: number }

// Client-side acceptance block on the public share page: pick any optional
// extras (adds to the live total), draw a signature, confirm details, accept.
export function AcceptanceBlock({
  token,
  clientName,
  clientCompany,
  brandColor,
  baseTotal = 0,
  optionalItems = [],
}: {
  token: string
  clientName: string
  clientCompany?: string | null
  brandColor: string
  baseTotal?: number
  optionalItems?: OptionalItem[]
}) {
  const [selected, setSelected] = useState<string[]>([])
  const toggle = (id: string) =>
    setSelected((s) => (s.includes(id) ? s.filter((x) => x !== id) : [...s, id]))
  const total =
    baseTotal +
    optionalItems.filter((i) => selected.includes(i.id)).reduce((sum, i) => sum + i.amount, 0)
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const drawing = useRef(false)
  const hasInk = useRef(false)
  const [name, setName] = useState(clientName)
  const [position, setPosition] = useState("")
  const [company, setCompany] = useState(clientCompany || "")
  const [state, setState] = useState<"idle" | "submitting" | "done">("idle")
  const [error, setError] = useState<string | null>(null)

  const pos = (e: React.PointerEvent) => {
    // Scale from displayed size to canvas coordinates - critical on phones
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
    ctx.lineWidth = 2
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

  const submit = async () => {
    setError(null)
    if (!name.trim()) return setError("Please enter your full name")
    if (!hasInk.current) return setError("Please sign in the box above")
    setState("submitting")
    try {
      const res = await fetch(`/api/p/${token}/accept`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: name.trim(),
          position: position.trim() || undefined,
          company: company.trim() || undefined,
          signature: canvasRef.current!.toDataURL("image/png"),
          selectedOptionalIds: selected,
        }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error)
      // Reload so the server re-renders the signed state and shows the deposit
      // prompt (it's server-rendered and needs the fresh signedAt).
      window.location.reload()
    } catch (e) {
      setError(e instanceof Error ? e.message : "Something went wrong - please try again")
      setState("idle")
    }
  }

  if (state === "done") {
    return (
      <div className="mt-10 border-2 rounded-xl p-8 text-center" style={{ borderColor: brandColor }}>
        <CheckCircle2 className="w-12 h-12 mx-auto mb-3" style={{ color: brandColor }} />
        <h3 className="text-xl font-bold text-gray-900 mb-1">Proposal accepted - thank you!</h3>
        <p className="text-gray-600">
          We&apos;ve recorded your acceptance and will be in touch shortly to arrange a start date.
        </p>
      </div>
    )
  }

  const input = "w-full px-3 py-2 border rounded-lg text-sm focus:outline-none focus:ring-2"

  return (
    <div className="mt-10 border rounded-xl p-6">
      <h3 className="text-lg font-bold text-gray-900 mb-1">Ready to proceed?</h3>
      <p className="text-sm text-gray-500 mb-4">
        Sign below to accept this proposal and we&apos;ll be in touch to arrange the works.
      </p>

      {optionalItems.length > 0 && (
        <div className="mb-5">
          <h4 className="font-semibold text-gray-900 mb-1">Optional extras</h4>
          <p className="text-sm text-gray-500 mb-3">
            Tick any you&apos;d like to include — your total updates automatically.
          </p>
          <div className="space-y-2">
            {optionalItems.map((item) => (
              <label key={item.id}
                className="flex items-center gap-3 border rounded-lg px-3 py-2.5 cursor-pointer hover:bg-gray-50">
                <input type="checkbox" checked={selected.includes(item.id)}
                  onChange={() => toggle(item.id)}
                  className="w-4 h-4 shrink-0" style={{ accentColor: brandColor }} />
                <span className="flex-1 text-sm">{item.description}</span>
                <span className="text-sm font-medium whitespace-nowrap">
                  + {formatCurrency(item.amount)}
                </span>
              </label>
            ))}
          </div>
          <div className="flex justify-between items-center mt-4 pt-3 border-t">
            <span className="text-sm text-gray-500">Total to proceed</span>
            <span className="text-2xl font-bold" style={{ color: brandColor }}>
              {formatCurrency(total)}
            </span>
          </div>
        </div>
      )}

      <div className="grid sm:grid-cols-3 gap-3 mb-4">
        <input className={input} placeholder="Full name *" value={name}
          onChange={(e) => setName(e.target.value)} />
        <input className={input} placeholder="Position (optional)" value={position}
          onChange={(e) => setPosition(e.target.value)} />
        <input className={input} placeholder="Company (optional)" value={company}
          onChange={(e) => setCompany(e.target.value)} />
      </div>

      <div className="border-2 border-dashed rounded-lg bg-gray-50 relative">
        <canvas ref={canvasRef} width={560} height={140}
          className="w-full touch-none cursor-crosshair"
          onPointerDown={start} onPointerMove={move} onPointerUp={end} onPointerLeave={end} />
        <span className="absolute bottom-1.5 left-3 text-[11px] text-gray-400 pointer-events-none">
          Sign here with your finger or mouse
        </span>
        <button type="button" onClick={clear}
          className="absolute top-1.5 right-2 text-xs text-gray-400 hover:text-gray-600">
          Clear
        </button>
      </div>

      {error && <p className="text-sm text-red-600 mt-3">{error}</p>}

      <button type="button" onClick={submit} disabled={state === "submitting"}
        className="mt-4 w-full sm:w-auto px-8 py-3 rounded-lg font-bold text-white disabled:opacity-60"
        style={{ backgroundColor: brandColor }}>
        {state === "submitting" ? "Submitting…" : "Accept Proposal"}
      </button>
      <p className="text-[11px] text-gray-400 mt-2">
        Signed {new Date().toLocaleDateString("en-GB")} · By accepting you agree to the terms in this proposal.
      </p>
    </div>
  )
}
