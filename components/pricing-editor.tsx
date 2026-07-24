"use client"

import { useEffect, useRef, useState } from "react"
import { toast } from "sonner"
import { Plus, Trash2 } from "lucide-react"
import { formatCurrency, calculateProposalTotals, lineNet } from "@/lib/utils"

export type EditableLineItem = {
  id: string
  description: string
  quantity: number
  unit: string
  unitPrice: number
  vat: number
  discount: number
  isOptional: boolean
  order: number
}

const UNITS = ["each", "hours", "days", "m²", "m", "visit", "item"]

export function PricingEditor({
  proposalId,
  initialItems,
  onItemsChange,
  measuredAreaSqm,
  measuredLinearMeters,
}: {
  proposalId: string
  initialItems: EditableLineItem[]
  onItemsChange?: (items: EditableLineItem[]) => void
  // Measurements taken on the survey aerial, offered as one-tap line items.
  measuredAreaSqm?: number | null
  measuredLinearMeters?: number | null
}) {
  const [items, setItems] = useState<EditableLineItem[]>(initialItems)
  const [showDiscount, setShowDiscount] = useState(initialItems.some((i) => i.discount > 0))
  const [saveState, setSaveState] = useState<"idle" | "saving" | "saved">("idle")
  const saveTimeout = useRef<ReturnType<typeof setTimeout> | null>(null)
  const isFirst = useRef(true)

  // Debounced autosave of the whole table
  useEffect(() => {
    if (isFirst.current) {
      isFirst.current = false
      return
    }
    setSaveState("saving")
    if (saveTimeout.current) clearTimeout(saveTimeout.current)
    saveTimeout.current = setTimeout(async () => {
      const res = await fetch(`/api/proposals/${proposalId}/pricing`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          items: items.filter((i) => i.description.trim().length > 0),
        }),
      })
      if (res.ok) {
        setSaveState("saved")
      } else {
        setSaveState("idle")
        toast.error("Failed to save pricing")
      }
    }, 900)
  }, [items, proposalId])

  const update = (id: string, patch: Partial<EditableLineItem>) =>
    setItems((prev) => prev.map((i) => (i.id === id ? { ...i, ...patch } : i)))

  // Keep the parent (and therefore the live preview) in sync
  useEffect(() => {
    onItemsChange?.(items)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [items])

  const addItem = () =>
    setItems((prev) => [
      ...prev,
      {
        id: `new-${Date.now()}`,
        description: "",
        quantity: 1,
        unit: "each",
        unitPrice: 0,
        vat: 20,
        discount: 0,
        isOptional: false,
        order: prev.length,
      },
    ])

  const removeItem = (id: string) =>
    setItems((prev) => prev.filter((i) => i.id !== id))

  // Insert a line item pre-filled with a measured quantity + unit (rate left to the user).
  const addMeasuredItem = (quantity: number, unit: string) =>
    setItems((prev) => [
      ...prev,
      {
        id: `new-${Date.now()}`,
        description: "",
        quantity,
        unit,
        unitPrice: 0,
        vat: 20,
        discount: 0,
        isOptional: false,
        order: prev.length,
      },
    ])

  const area = measuredAreaSqm ? Math.round(measuredAreaSqm) : 0
  const length = measuredLinearMeters ? Math.round(measuredLinearMeters) : 0

  const totals = calculateProposalTotals(items)
  const num = (v: string) => (v === "" ? 0 : parseFloat(v) || 0)

  const cell =
    "px-2 py-1.5 border rounded-md text-sm focus:outline-none focus:ring-1 focus:ring-brand-blue w-full"

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h3 className="font-semibold text-brand-navy">Pricing</h3>
        <div className="flex items-center gap-3">
          <label className="flex items-center gap-1.5 text-xs font-medium text-gray-500 cursor-pointer select-none">
            <input type="checkbox" checked={showDiscount}
              onChange={(e) => setShowDiscount(e.target.checked)}
              className="rounded accent-blue-600" />
            Discounts
          </label>
          <span className="text-xs text-gray-400">
            {saveState === "saving" ? "Saving…" : saveState === "saved" ? "Saved" : ""}
          </span>
        </div>
      </div>

      <div className="space-y-3">
        {items.map((item) => (
          <div key={item.id} className="border rounded-xl p-3 space-y-2 bg-gray-50/50">
            <div className="flex gap-2">
              <input
                className={cell}
                placeholder="Description (e.g. Full roof clean and moss treatment)"
                value={item.description}
                onChange={(e) => update(item.id, { description: e.target.value })}
              />
              <button type="button" onClick={() => removeItem(item.id)}
                className="p-2 text-gray-400 hover:text-red-600 hover:bg-red-50 rounded-lg shrink-0">
                <Trash2 className="w-4 h-4" />
              </button>
            </div>
            <div className={`grid grid-cols-3 gap-2 items-center ${showDiscount ? "sm:grid-cols-6" : "sm:grid-cols-5"}`}>
              <div>
                <label className="text-[11px] text-gray-500">Qty</label>
                <input type="number" min="0" step="any" className={cell} value={item.quantity}
                  onChange={(e) => update(item.id, { quantity: num(e.target.value) })} />
              </div>
              <div>
                <label className="text-[11px] text-gray-500">Unit</label>
                <select className={cell} value={item.unit}
                  onChange={(e) => update(item.id, { unit: e.target.value })}>
                  {UNITS.map((u) => <option key={u}>{u}</option>)}
                </select>
              </div>
              <div>
                <label className="text-[11px] text-gray-500">Unit price £</label>
                <input type="number" min="0" step="0.01" className={cell}
                  value={item.unitPrice === 0 ? "" : item.unitPrice} placeholder="0"
                  onChange={(e) => update(item.id, { unitPrice: num(e.target.value) })} />
              </div>
              <div>
                <label className="text-[11px] text-gray-500">VAT %</label>
                <input type="number" min="0" max="100" className={cell} value={item.vat}
                  onChange={(e) => update(item.id, { vat: num(e.target.value) })} />
              </div>
              {showDiscount && (
                <div>
                  <label className="text-[11px] text-gray-500">Discount %</label>
                  <input type="number" min="0" max="100" className={cell} value={item.discount}
                    onChange={(e) => update(item.id, { discount: num(e.target.value) })} />
                </div>
              )}
              <div className="text-right">
                <label className="text-[11px] text-gray-500 block">Net</label>
                <div className="text-sm font-semibold py-1.5">{formatCurrency(lineNet(item))}</div>
              </div>
            </div>
            <label className="flex items-center gap-2 text-xs font-medium text-gray-600 cursor-pointer select-none">
              <input type="checkbox" checked={item.isOptional}
                onChange={(e) => update(item.id, { isOptional: e.target.checked })}
                className="rounded accent-blue-600" />
              Optional extra (shown to client, excluded from total)
            </label>
          </div>
        ))}
      </div>

      <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
        <button type="button" onClick={addItem}
          className="inline-flex items-center gap-2 text-sm font-semibold text-brand-blue hover:underline">
          <Plus className="w-4 h-4" /> Add line item
        </button>
        {area > 0 && (
          <button type="button" onClick={() => addMeasuredItem(area, "m²")}
            className="inline-flex items-center gap-1.5 text-sm font-medium text-emerald-700 bg-emerald-50 border border-emerald-200 rounded-lg px-2.5 py-1 hover:bg-emerald-100">
            <Plus className="w-3.5 h-3.5" /> Use measured area ({area.toLocaleString()} m²)
          </button>
        )}
        {length > 0 && (
          <button type="button" onClick={() => addMeasuredItem(length, "m")}
            className="inline-flex items-center gap-1.5 text-sm font-medium text-emerald-700 bg-emerald-50 border border-emerald-200 rounded-lg px-2.5 py-1 hover:bg-emerald-100">
            <Plus className="w-3.5 h-3.5" /> Use measured length ({length.toLocaleString()} m)
          </button>
        )}
      </div>

      <div className="border-t pt-3 space-y-1 text-sm">
        <div className="flex justify-between text-gray-500">
          <span>Subtotal</span><span>{formatCurrency(totals.subtotal)}</span>
        </div>
        <div className="flex justify-between text-gray-500">
          <span>VAT</span><span>{formatCurrency(totals.vat)}</span>
        </div>
        <div className="flex justify-between font-bold text-brand-navy text-base">
          <span>Total</span><span>{formatCurrency(totals.total)}</span>
        </div>
      </div>
    </div>
  )
}
