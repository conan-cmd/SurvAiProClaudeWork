"use client"

import { useEffect, useRef, useState } from "react"
import Link from "next/link"
import { toast } from "sonner"
import { Loader2, Plus, Trash2, List, BellRing } from "lucide-react"
import { parsePipelineStages, type PipelineStage } from "@/lib/pipeline"
import { parseNudgeHistory } from "@/lib/nudge"
import { calculateProposalTotals, formatCurrency } from "@/lib/utils"

type BoardProposal = {
  id: string
  status: string
  clientName: string
  pipelineStageId: string | null
  nudgeHistory: string | null
  updatedAt: string
  pricingLineItems: { quantity: number; unitPrice: number; vat: number; discount: number; isOptional: boolean }[]
  survey: { title: string }
}

// Open proposals only — a won/signed/lost deal has left the pipeline.
const OPEN_STATUSES = new Set(["DRAFT", "READY", "SENT"])
const HIGHLIGHT = ["ring-2", "ring-brand-blue"]

// Which column an untouched card lands in: draft-ish → first stage, sent →
// second (falling back to the first when only one stage exists).
function autoStage(p: BoardProposal, stages: PipelineStage[]): string {
  if (p.pipelineStageId && stages.some((s) => s.id === p.pipelineStageId)) return p.pipelineStageId
  if (p.status === "SENT" && stages.length > 1) return stages[1].id
  return stages[0].id
}

export default function PipelinePage() {
  const [proposals, setProposals] = useState<BoardProposal[] | null>(null)
  const [stages, setStages] = useState<PipelineStage[] | null>(null)
  const [dragId, setDragId] = useState<string | null>(null)
  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const touchCol = useRef<HTMLElement | null>(null)

  useEffect(() => {
    fetch("/api/proposals").then((r) => r.json())
      .then((d) => setProposals(Array.isArray(d) ? d.filter((p) => OPEN_STATUSES.has(p.status)) : []))
      .catch(() => toast.error("Failed to load proposals"))
    fetch("/api/organization").then((r) => r.json())
      .then((org) => setStages(parsePipelineStages(org || {})))
      .catch(() => setStages(parsePipelineStages({})))
  }, [])

  const saveStages = (next: PipelineStage[]) => {
    setStages(next)
    if (saveTimer.current) clearTimeout(saveTimer.current)
    saveTimer.current = setTimeout(async () => {
      const res = await fetch("/api/organization", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ pipelineStages: JSON.stringify(next) }),
      })
      if (!res.ok) toast.error("Couldn't save the stages")
    }, 600)
  }

  const moveCard = async (proposalId: string, stageId: string) => {
    setProposals((ps) => ps ? ps.map((p) => (p.id === proposalId ? { ...p, pipelineStageId: stageId } : p)) : ps)
    const res = await fetch(`/api/proposals/${proposalId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ pipelineStageId: stageId }),
    })
    if (!res.ok) toast.error("Couldn't move the proposal")
  }

  const clearTouchCol = () => {
    touchCol.current?.classList.remove(...HIGHLIGHT)
    touchCol.current = null
  }

  if (!proposals || !stages) {
    return <div className="flex justify-center py-20"><Loader2 className="w-8 h-8 animate-spin text-brand-blue" /></div>
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-brand-navy">Pipeline</h1>
          <p className="text-sm text-gray-500">
            Open proposals by stage — drag cards between columns, click a column name to rename it.
          </p>
        </div>
        <Link href="/proposals"
          className="inline-flex items-center gap-1.5 px-3 py-2 border rounded-lg text-sm font-medium bg-white hover:bg-gray-50">
          <List className="w-4 h-4" /> List view
        </Link>
      </div>

      <div className="flex gap-3 overflow-x-auto pb-4 items-start">
        {stages.map((stage) => {
          const cards = proposals.filter((p) => autoStage(p, stages) === stage.id)
          const value = cards.reduce((s, p) => s + calculateProposalTotals(p.pricingLineItems).total, 0)
          return (
            <div key={stage.id} data-stage-id={stage.id}
              className="w-64 sm:w-72 shrink-0 bg-gray-100 rounded-xl p-2.5"
              onDragOver={(e) => { if (dragId) { e.preventDefault(); e.dataTransfer.dropEffect = "move" } }}
              onDrop={(e) => {
                e.preventDefault()
                const id = e.dataTransfer.getData("text/x-survai-card")
                if (id) moveCard(id, stage.id)
                setDragId(null)
              }}>
              <div className="flex items-center gap-1.5 px-1 pb-2">
                <input value={stage.name} aria-label="Stage name"
                  onChange={(e) => saveStages(stages.map((s) => (s.id === stage.id ? { ...s, name: e.target.value } : s)))}
                  className="flex-1 min-w-0 bg-transparent text-sm font-bold text-brand-navy focus:outline-none focus:bg-white focus:ring-1 focus:ring-brand-blue rounded px-1 py-0.5" />
                <span className="text-xs text-gray-400 shrink-0">{cards.length}</span>
                <button type="button" disabled={stages.length === 1} aria-label={`Delete stage ${stage.name}`}
                  onClick={() => {
                    if (!confirm(`Remove the "${stage.name}" stage? Its proposals return to automatic placement.`)) return
                    saveStages(stages.filter((s) => s.id !== stage.id))
                  }}
                  className="p-1 text-gray-300 hover:text-red-500 disabled:opacity-30 shrink-0">
                  <Trash2 className="w-3.5 h-3.5" />
                </button>
              </div>
              {value > 0 && <div className="px-1 pb-2 text-xs text-gray-500 -mt-1.5">{formatCurrency(value)} inc VAT</div>}

              <div className="space-y-2 min-h-[60px]">
                {cards.map((p) => {
                  const nudges = parseNudgeHistory(p.nudgeHistory).length
                  return (
                    <div key={p.id}
                      draggable
                      onDragStart={(e) => {
                        e.dataTransfer.setData("text/x-survai-card", p.id)
                        e.dataTransfer.effectAllowed = "move"
                        setDragId(p.id)
                      }}
                      onDragEnd={() => setDragId(null)}
                      onTouchStart={() => setDragId(p.id)}
                      onTouchMove={(e) => {
                        const t = e.touches[0]
                        const el = document.elementFromPoint(t.clientX, t.clientY)
                        const col = (el?.closest("[data-stage-id]") as HTMLElement | null) || null
                        if (col !== touchCol.current) {
                          clearTouchCol()
                          if (col) { col.classList.add(...HIGHLIGHT); touchCol.current = col }
                        }
                      }}
                      onTouchEnd={() => {
                        const target = touchCol.current?.dataset.stageId
                        clearTouchCol()
                        if (target && dragId) moveCard(dragId, target)
                        setDragId(null)
                      }}
                      onTouchCancel={() => { clearTouchCol(); setDragId(null) }}
                      className={`bg-white rounded-lg shadow-sm border p-3 cursor-grab active:cursor-grabbing ${dragId === p.id ? "opacity-50" : ""}`}
                      style={{ touchAction: "none" }}>
                      <Link href={`/proposals/${p.id}`} draggable={false} className="block">
                        <div className="text-sm font-semibold text-gray-900 leading-snug">{p.survey.title}</div>
                        <div className="text-xs text-gray-500 mt-0.5 truncate">
                          {p.clientName} · {formatCurrency(calculateProposalTotals(p.pricingLineItems).total)}
                        </div>
                        <div className="flex flex-wrap items-center gap-1 mt-1.5">
                          <span className="text-[10px] font-semibold px-1.5 py-0.5 rounded-full bg-gray-100 text-gray-500">{p.status}</span>
                          {nudges > 0 && (
                            <span className="inline-flex items-center gap-0.5 text-[10px] font-semibold px-1.5 py-0.5 rounded-full bg-amber-50 text-amber-700">
                              <BellRing className="w-2.5 h-2.5" /> ×{nudges}
                            </span>
                          )}
                        </div>
                      </Link>
                    </div>
                  )
                })}
                {cards.length === 0 && (
                  <div className="text-xs text-gray-400 text-center py-4 border-2 border-dashed border-gray-200 rounded-lg">
                    Drop proposals here
                  </div>
                )}
              </div>
            </div>
          )
        })}
        <button type="button"
          onClick={() => saveStages([...stages, { id: `s-${Date.now()}`, name: "New stage" }])}
          className="shrink-0 self-start inline-flex items-center gap-1.5 px-3 py-2.5 border-2 border-dashed border-gray-300 rounded-xl text-sm font-medium text-gray-500 hover:border-brand-blue hover:text-brand-blue">
          <Plus className="w-4 h-4" /> Add stage
        </button>
      </div>
    </div>
  )
}
