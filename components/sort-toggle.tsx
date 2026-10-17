"use client"

import { usePathname, useRouter, useSearchParams } from "next/navigation"
import { ArrowDown, ArrowUp } from "lucide-react"

// Date-order toggle for list pages (?sort=new|old). Clicking the active chip
// clears it, returning to the list's default (manual drag order, then last
// updated).
export function SortToggle() {
  const router = useRouter()
  const pathname = usePathname()
  const params = useSearchParams()
  const sort = params.get("sort")

  const set = (v: "new" | "old") => {
    const p = new URLSearchParams(params.toString())
    if (sort === v) p.delete("sort")
    else p.set("sort", v)
    const s = p.toString()
    router.push(`${pathname}${s ? `?${s}` : ""}`)
  }

  const chip = (on: boolean) =>
    `inline-flex items-center gap-1 px-3 py-1.5 rounded-full text-sm font-medium border transition whitespace-nowrap ${
      on ? "bg-brand-navy text-white border-brand-navy" : "bg-white text-gray-600 hover:border-gray-400"
    }`

  return (
    <span className="inline-flex items-center gap-1.5">
      <button type="button" onClick={() => set("new")} className={chip(sort === "new")}
        title="Most recently created first">
        <ArrowDown className="w-3.5 h-3.5" /> Newest
      </button>
      <button type="button" onClick={() => set("old")} className={chip(sort === "old")}
        title="Oldest first">
        <ArrowUp className="w-3.5 h-3.5" /> Oldest
      </button>
    </span>
  )
}
