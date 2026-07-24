"use client"

import { useEffect, useRef, useState } from "react"
import { useParams } from "next/navigation"
import { CheckCircle2, Loader2, AlertTriangle, ShieldAlert } from "lucide-react"

type Hazard = {
  hazard: string; whoAtRisk: string; controls: string; ppe: string
  preP?: number; preS?: number; resP?: number; resS?: number
}
type Op = { id: string; name: string; signedAt: string | null }
type Data = {
  title: string
  survey: { title: string; clientName: string; clientAddress: string; serviceType: string }
  organization: { name: string; logoUrl: string | null; brandColor: string; phone: string | null; email: string | null }
  sections: Record<string, unknown>
  hazards: Hazard[]
  methodStatement: unknown
  ppe: string[]
  siteInfo: string
  operatives: Op[]
}

function rrBand(v: number): { bg: string; fg: string; label: string } {
  if (!v) return { bg: "#f3f4f6", fg: "#9ca3af", label: "—" }
  if (v >= 16) return { bg: "#dc2626", fg: "#fff", label: "Urgent" }
  if (v >= 11) return { bg: "#f97316", fg: "#fff", label: "High" }
  if (v >= 8) return { bg: "#facc15", fg: "#111827", label: "Medium" }
  if (v >= 2) return { bg: "#22c55e", fg: "#fff", label: "Low" }
  return { bg: "#16a34a", fg: "#fff", label: "No action" }
}
const list = (v: unknown) => (Array.isArray(v) ? (v as string[]).filter((x) => x && x.trim()) : [])
const str = (v: unknown) => (typeof v === "string" ? v : "")

type MethodGroup = { title: string; steps: string[] }
function asMethodGroups(v: unknown): MethodGroup[] {
  if (!Array.isArray(v) || v.length === 0) return []
  if (typeof v[0] === "string") return [{ title: "", steps: (v as string[]).filter((s) => s && s.trim()) }]
  return (v as MethodGroup[]).map((g) => ({ title: g.title || "", steps: (g.steps || []).filter((s) => s && s.trim()) }))
    .filter((g) => g.steps.length > 0)
}

export default function PublicRamsPage() {
  const { token } = useParams<{ token: string }>()
  const [data, setData] = useState<Data | null>(null)
  const [notFound, setNotFound] = useState(false)

  const [selectedId, setSelectedId] = useState<string | "new" | null>(null)
  const [name, setName] = useState("")
  const [state, setState] = useState<"idle" | "submitting" | "done">("idle")
  const [error, setError] = useState<string | null>(null)

  const canvasRef = useRef<HTMLCanvasElement>(null)
  const drawing = useRef(false)
  const hasInk = useRef(false)

  const load = () => {
    fetch(`/api/r/${token}`)
      .then((r) => { if (!r.ok) throw new Error(); return r.json() })
      .then(setData)
      .catch(() => setNotFound(true))
  }
  useEffect(load, [token])

  const pos = (e: React.PointerEvent) => {
    const c = canvasRef.current!
    const rect = c.getBoundingClientRect()
    return { x: (e.clientX - rect.left) * (c.width / rect.width), y: (e.clientY - rect.top) * (c.height / rect.height) }
  }
  const start = (e: React.PointerEvent) => {
    drawing.current = true; hasInk.current = true
    const ctx = canvasRef.current!.getContext("2d")!
    const p = pos(e); ctx.beginPath(); ctx.moveTo(p.x, p.y)
  }
  const move = (e: React.PointerEvent) => {
    if (!drawing.current) return
    const ctx = canvasRef.current!.getContext("2d")!
    const p = pos(e)
    ctx.lineWidth = 2; ctx.lineCap = "round"; ctx.strokeStyle = "#0F172A"
    ctx.lineTo(p.x, p.y); ctx.stroke()
  }
  const end = () => (drawing.current = false)
  const clearSig = () => {
    const c = canvasRef.current
    if (c) c.getContext("2d")!.clearRect(0, 0, c.width, c.height)
    hasInk.current = false
  }

  const submit = async () => {
    setError(null)
    if (!name.trim()) return setError("Please enter your name")
    if (!hasInk.current) return setError("Please sign in the box")
    setState("submitting")
    try {
      const res = await fetch(`/api/r/${token}/sign`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          operativeId: selectedId && selectedId !== "new" ? selectedId : undefined,
          name: name.trim(),
          signature: canvasRef.current!.toDataURL("image/png"),
        }),
      })
      const d = await res.json()
      if (!res.ok) throw new Error(d.error)
      setState("done")
    } catch (e) {
      setError(e instanceof Error ? e.message : "Something went wrong — please try again")
      setState("idle")
    }
  }

  if (notFound) {
    return (
      <div className="min-h-screen flex items-center justify-center p-6 text-center">
        <div>
          <AlertTriangle className="w-10 h-10 text-amber-500 mx-auto mb-3" />
          <p className="text-gray-600">This link is no longer valid.</p>
        </div>
      </div>
    )
  }
  if (!data) {
    return <div className="min-h-screen flex items-center justify-center"><Loader2 className="w-8 h-8 animate-spin text-gray-400" /></div>
  }

  const brand = data.organization.brandColor || "#2563EB"
  const s = data.sections
  const input = "w-full px-3 py-2 border rounded-lg text-sm focus:outline-none focus:ring-2"

  const Section = ({ title, children }: { title: string; children: React.ReactNode }) => (
    <section className="bg-white rounded-xl shadow-sm p-5">
      <h2 className="font-semibold text-gray-900 mb-2">{title}</h2>
      {children}
    </section>
  )
  const Bullets = ({ items }: { items: string[] }) =>
    items.length ? <ul className="list-disc pl-5 text-sm text-gray-700 space-y-0.5">{items.map((x, i) => <li key={i}>{x}</li>)}</ul> : null

  return (
    <div className="min-h-screen bg-gray-50 py-6 px-4">
      <div className="max-w-2xl mx-auto space-y-4">
        {/* Header */}
        <div className="bg-white rounded-xl shadow-sm p-5" style={{ borderTop: `4px solid ${brand}` }}>
          <div className="flex items-center gap-3">
            {data.organization.logoUrl && (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={data.organization.logoUrl} alt="" className="h-9 w-auto object-contain" />
            )}
            <div className="font-bold text-gray-900">{data.organization.name}</div>
          </div>
          <h1 className="mt-3 text-lg font-bold" style={{ color: brand }}>Risk Assessment &amp; Method Statement</h1>
          <div className="text-sm text-gray-500">{data.survey.title}</div>
        </div>

        <Section title="Job details">
          <div className="text-sm text-gray-600 space-y-1">
            <div><span className="text-gray-400">Client:</span> {data.survey.clientName}</div>
            <div><span className="text-gray-400">Site:</span> {data.survey.clientAddress}</div>
            {str(s.activity) && <div><span className="text-gray-400">Activity:</span> {str(s.activity)}</div>}
            {str(s.siteSupervisor) && <div><span className="text-gray-400">Supervisor:</span> {str(s.siteSupervisor)}</div>}
            {str(s.emergencyContacts) && <div><span className="text-gray-400">Emergency:</span> {str(s.emergencyContacts)}</div>}
            {str(s.nearestHospital) && <div><span className="text-gray-400">Nearest A&amp;E:</span> {str(s.nearestHospital)}</div>}
          </div>
        </Section>

        {str(s.descriptionOfWorks) && <Section title="Description of works"><p className="text-sm text-gray-700">{str(s.descriptionOfWorks)}</p></Section>}
        {list(s.responsibilities).length > 0 && <Section title="Personnel & responsibilities"><Bullets items={list(s.responsibilities)} /></Section>}
        {list(s.equipment).length > 0 && <Section title="Equipment"><Bullets items={list(s.equipment)} /></Section>}
        {data.ppe.filter((x) => x && x.trim()).length > 0 && <Section title="PPE required"><Bullets items={data.ppe.filter((x) => x && x.trim())} /></Section>}

        {data.hazards.length > 0 && (
          <Section title="Main hazards & control measures">
            <div className="space-y-3">
              {data.hazards.map((h, i) => {
                const pre = (h.preP || 0) * (h.preS || 0)
                const res = (h.resP || 0) * (h.resS || 0)
                const pb = rrBand(pre), rb = rrBand(res)
                return (
                  <div key={i} className="border rounded-lg p-3">
                    <div className="font-semibold text-sm text-gray-900">{i + 1}. {h.hazard}</div>
                    {h.whoAtRisk && <div className="text-xs text-gray-500 mt-0.5">Who: {h.whoAtRisk}</div>}
                    <div className="text-sm text-gray-700 mt-1">{h.controls}</div>
                    {h.ppe && <div className="text-xs text-gray-500 mt-1">PPE: {h.ppe}</div>}
                    <div className="flex gap-3 mt-2 text-xs">
                      {pre > 0 && <span>Pre-control: <b style={{ background: pb.bg, color: pb.fg }} className="px-2 py-0.5 rounded">{pre} · {pb.label}</b></span>}
                      {res > 0 && <span>Residual: <b style={{ background: rb.bg, color: rb.fg }} className="px-2 py-0.5 rounded">{res} · {rb.label}</b></span>}
                    </div>
                  </div>
                )
              })}
            </div>
          </Section>
        )}

        {asMethodGroups(data.methodStatement).length > 0 && (
          <Section title="Method statement">
            <div className="space-y-3">
              {asMethodGroups(data.methodStatement).map((g, gi) => (
                <div key={gi}>
                  <div className="font-semibold text-sm text-gray-900">Step {gi + 1}{g.title ? ` – ${g.title}` : ""}</div>
                  <ul className="list-disc pl-5 text-sm text-gray-700 space-y-0.5 mt-0.5">
                    {g.steps.map((s, si) => <li key={si}>{s}</li>)}
                  </ul>
                </div>
              ))}
            </div>
          </Section>
        )}

        {list(s.environmentalControls).length > 0 && <Section title="Environmental controls"><Bullets items={list(s.environmentalControls)} /></Section>}
        {list(s.emergencyProcedures).length > 0 && <Section title="Emergency procedures"><Bullets items={list(s.emergencyProcedures)} /></Section>}
        {list(s.coshh).length > 0 && <Section title="COSHH & hazardous substances"><Bullets items={list(s.coshh)} /></Section>}
        {list(s.competency).length > 0 && <Section title="Competency"><Bullets items={list(s.competency)} /></Section>}

        {/* Sign block */}
        {state === "done" ? (
          <div className="bg-white rounded-xl shadow-sm p-8 text-center" style={{ borderTop: `4px solid ${brand}` }}>
            <CheckCircle2 className="w-12 h-12 mx-auto mb-3" style={{ color: brand }} />
            <h3 className="text-xl font-bold text-gray-900 mb-1">Signed — thank you</h3>
            <p className="text-gray-600 text-sm">Your acknowledgement has been recorded. You may close this page.</p>
          </div>
        ) : (
          <div className="bg-white rounded-xl shadow-sm p-5">
            <div className="flex items-center gap-2 mb-1">
              <ShieldAlert className="w-5 h-5" style={{ color: brand }} />
              <h2 className="font-bold text-gray-900">Sign to confirm you&apos;ve read this RAMS</h2>
            </div>
            <p className="text-sm text-gray-500 mb-4">
              By signing you confirm you have read and understood this RAMS and agree to follow the control measures.
            </p>

            {data.operatives.length > 0 && (
              <div className="mb-4">
                <label className="block text-xs text-gray-400 mb-1.5">Who are you?</label>
                <div className="flex flex-wrap gap-2">
                  {data.operatives.map((o) => (
                    <button key={o.id} type="button" disabled={!!o.signedAt}
                      onClick={() => { setSelectedId(o.id); setName(o.name) }}
                      className={`px-3 py-1.5 rounded-lg border text-sm ${
                        o.signedAt ? "bg-emerald-50 border-emerald-200 text-emerald-600 cursor-default"
                        : selectedId === o.id ? "border-2 text-gray-900 font-medium"
                        : "border-gray-200 text-gray-600 hover:bg-gray-50"
                      }`}
                      style={selectedId === o.id && !o.signedAt ? { borderColor: brand } : undefined}>
                      {o.name || "Unnamed"}{o.signedAt ? " ✓" : ""}
                    </button>
                  ))}
                  <button type="button" onClick={() => { setSelectedId("new"); setName("") }}
                    className={`px-3 py-1.5 rounded-lg border text-sm ${selectedId === "new" ? "border-2 text-gray-900 font-medium" : "border-gray-200 text-gray-600 hover:bg-gray-50"}`}
                    style={selectedId === "new" ? { borderColor: brand } : undefined}>
                    + I&apos;m not listed
                  </button>
                </div>
              </div>
            )}

            <label className="block text-xs text-gray-400 mb-1">Your full name</label>
            <input className={`${input} mb-4`} value={name} onChange={(e) => setName(e.target.value)} placeholder="Full name" />

            <div className="border-2 border-dashed rounded-lg bg-gray-50 relative">
              <canvas ref={canvasRef} width={560} height={150}
                className="w-full touch-none cursor-crosshair"
                onPointerDown={start} onPointerMove={move} onPointerUp={end} onPointerLeave={end} />
              <span className="absolute bottom-1.5 left-3 text-[11px] text-gray-400 pointer-events-none">Sign here with your finger</span>
              <button type="button" onClick={clearSig} className="absolute top-1.5 right-2 text-xs text-gray-400 hover:text-gray-600">Clear</button>
            </div>

            {error && <p className="text-sm text-red-600 mt-3">{error}</p>}

            <button type="button" onClick={submit} disabled={state === "submitting"}
              className="mt-4 w-full px-8 py-3 rounded-lg font-bold text-white disabled:opacity-60"
              style={{ backgroundColor: brand }}>
              {state === "submitting" ? "Submitting…" : "Sign RAMS"}
            </button>
          </div>
        )}

        <p className="text-center text-[11px] text-gray-400 pb-6">Powered by SurvAIPro</p>
      </div>
    </div>
  )
}
