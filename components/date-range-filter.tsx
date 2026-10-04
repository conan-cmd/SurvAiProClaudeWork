"use client"

import { useState } from "react"
import { usePathname, useRouter, useSearchParams } from "next/navigation"
import { CalendarRange, X } from "lucide-react"

// Custom from–to date range for list filters. Applying it clears any preset
// period chip (?period=) and sets ?from=YYYY-MM-DD&to=YYYY-MM-DD, keeping
// every other active filter.
export function DateRangeFilter() {
  const router = useRouter()
  const pathname = usePathname()
  const params = useSearchParams()
  const [from, setFrom] = useState(params.get("from") || "")
  const [to, setTo] = useState(params.get("to") || "")
  const active = Boolean(params.get("from") || params.get("to"))

  const push = (nextFrom: string, nextTo: string) => {
    const p = new URLSearchParams(params.toString())
    p.delete("period")
    if (nextFrom) p.set("from", nextFrom)
    else p.delete("from")
    if (nextTo) p.set("to", nextTo)
    else p.delete("to")
    const s = p.toString()
    router.push(`${pathname}${s ? `?${s}` : ""}`)
  }

  const inputCls =
    "border rounded-full px-3 py-1.5 text-sm bg-white text-gray-600 focus:outline-none focus:ring-2 focus:ring-brand-blue/30"

  return (
    <span className="inline-flex flex-wrap items-center gap-1.5">
      <CalendarRange className={`w-4 h-4 ${active ? "text-brand-navy" : "text-gray-400"}`} />
      <input type="date" aria-label="From date" className={inputCls} value={from} max={to || undefined}
        onChange={(e) => setFrom(e.target.value)} />
      <span className="text-gray-400">–</span>
      <input type="date" aria-label="To date" className={inputCls} value={to} min={from || undefined}
        onChange={(e) => setTo(e.target.value)} />
      <button onClick={() => push(from, to)} disabled={!from && !to}
        className="px-3 py-1.5 rounded-full text-sm font-medium border bg-brand-navy text-white border-brand-navy disabled:opacity-40">
        Apply
      </button>
      {active && (
        <button onClick={() => { setFrom(""); setTo(""); push("", "") }}
          aria-label="Clear date range"
          className="p-1.5 rounded-full border bg-white text-gray-500 hover:border-gray-400">
          <X className="w-3.5 h-3.5" />
        </button>
      )}
    </span>
  )
}
