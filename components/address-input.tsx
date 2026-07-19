"use client"

import { useEffect, useRef, useState } from "react"
import { LocateFixed, Loader2, MapPin } from "lucide-react"

// Address field with Google Places typeahead. Falls back to a plain
// textarea when no suggestions are available (e.g. key not configured).
export function AddressInput({
  value,
  onChange,
  className = "",
  placeholder,
}: {
  value: string
  onChange: (value: string) => void
  className?: string
  placeholder?: string
}) {
  const [suggestions, setSuggestions] = useState<string[]>([])
  const [open, setOpen] = useState(false)
  const [locating, setLocating] = useState(false)
  const coords = useRef<{ lat: number; lng: number } | null>(null)
  const skipNextFetch = useRef(false)
  const debounce = useRef<ReturnType<typeof setTimeout> | null>(null)

  // Grab device location once (silently) to bias suggestions towards
  // nearby addresses - surveyors are usually standing at the property
  useEffect(() => {
    navigator.geolocation?.getCurrentPosition(
      (pos) => {
        coords.current = { lat: pos.coords.latitude, lng: pos.coords.longitude }
      },
      () => {},
      { maximumAge: 300000, timeout: 8000 }
    )
  }, [])

  const geoParams = () =>
    coords.current ? `&lat=${coords.current.lat}&lng=${coords.current.lng}` : ""

  const useMyLocation = () => {
    setLocating(true)
    navigator.geolocation?.getCurrentPosition(
      async (pos) => {
        coords.current = { lat: pos.coords.latitude, lng: pos.coords.longitude }
        try {
          const res = await fetch(
            `/api/geo/autocomplete?mode=reverse&lat=${pos.coords.latitude}&lng=${pos.coords.longitude}`
          )
          const data: string[] = await res.json()
          if (data[0]) {
            skipNextFetch.current = true
            onChange(data[0])
          }
        } catch {
          // leave field as-is
        } finally {
          setLocating(false)
        }
      },
      () => setLocating(false),
      { timeout: 10000 }
    )
  }

  useEffect(() => {
    if (skipNextFetch.current) {
      skipNextFetch.current = false
      return
    }
    if (debounce.current) clearTimeout(debounce.current)
    if (value.trim().length < 2) {
      setSuggestions([])
      return
    }
    debounce.current = setTimeout(async () => {
      try {
        const res = await fetch(`/api/geo/autocomplete?q=${encodeURIComponent(value)}${geoParams()}`)
        if (!res.ok) return
        const data: string[] = await res.json()
        setSuggestions(data)
        setOpen(data.length > 0)
      } catch {
        // typing continues to work without suggestions
      }
    }, 350)
  }, [value])

  const pick = (suggestion: string) => {
    skipNextFetch.current = true
    onChange(suggestion)
    setSuggestions([])
    setOpen(false)
  }

  return (
    <div className="relative">
      <textarea
        rows={2}
        className={className}
        value={value}
        placeholder={placeholder}
        onChange={(e) => onChange(e.target.value)}
        onFocus={() => suggestions.length && setOpen(true)}
        onBlur={() => setTimeout(() => setOpen(false), 150)}
      />
      <button type="button" onClick={useMyLocation} disabled={locating}
        className="mt-1.5 inline-flex items-center gap-1.5 text-xs font-semibold text-brand-blue hover:underline disabled:opacity-50">
        {locating ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <LocateFixed className="w-3.5 h-3.5" />}
        {locating ? "Finding your location…" : "Use my current location"}
      </button>
      {open && (
        <ul className="absolute z-20 left-0 right-0 mt-1 bg-white border rounded-lg shadow-lg overflow-hidden">
          {suggestions.map((s) => (
            <li key={s}>
              <button
                type="button"
                onMouseDown={(e) => e.preventDefault()}
                onClick={() => pick(s)}
                className="w-full text-left px-3 py-2.5 text-sm hover:bg-blue-50 flex items-start gap-2"
              >
                <MapPin className="w-4 h-4 text-brand-blue shrink-0 mt-0.5" />
                {s}
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
