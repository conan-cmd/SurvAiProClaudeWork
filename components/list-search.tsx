"use client"

import { useRef, useState } from "react"
import { usePathname, useRouter, useSearchParams } from "next/navigation"
import { Search, X } from "lucide-react"

// Debounced search box for the list pages. Writes `q` into the URL so the
// (server-rendered) list re-queries; preserves the other filters (folder/scope).
export function ListSearch({ placeholder = "Search…" }: { placeholder?: string }) {
  const router = useRouter()
  const pathname = usePathname()
  const params = useSearchParams()
  const [value, setValue] = useState(params.get("q") || "")
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null)

  const apply = (v: string) => {
    setValue(v)
    if (timer.current) clearTimeout(timer.current)
    timer.current = setTimeout(() => {
      const p = new URLSearchParams(params.toString())
      if (v.trim()) p.set("q", v.trim())
      else p.delete("q")
      router.replace(`${pathname}${p.toString() ? `?${p.toString()}` : ""}`)
    }, 350)
  }

  return (
    <div className="relative">
      <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400 pointer-events-none" />
      <input
        type="search"
        value={value}
        onChange={(e) => apply(e.target.value)}
        placeholder={placeholder}
        aria-label="Search"
        className="w-full pl-9 pr-9 py-2.5 border rounded-lg text-sm bg-white focus:outline-none focus:ring-2 focus:ring-brand-blue"
      />
      {value && (
        <button type="button" onClick={() => apply("")} aria-label="Clear search"
          className="absolute right-2.5 top-1/2 -translate-y-1/2 p-0.5 text-gray-400 hover:text-gray-600">
          <X className="w-4 h-4" />
        </button>
      )}
    </div>
  )
}
