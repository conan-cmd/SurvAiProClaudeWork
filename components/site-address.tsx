"use client"

import { useState } from "react"
import { toast } from "sonner"
import { Loader2, MapPin, Pencil, Search } from "lucide-react"
import { AddressInput } from "@/components/address-input"
import type { Photo } from "@/components/photo-manager"

export type LocationUpdate = {
  clientAddress: string
  latitude: number
  longitude: number
  what3words: string | null
  photos: Photo[]
  imageryOk?: boolean
}

// Editable site address with Places autocomplete. Lets a surveyor correct the
// address and re-pick the right property when the auto-located aerial / Street
// View landed on the wrong building (or never resolved at all).
export function SiteAddress({
  surveyId,
  address,
  hasCoords,
  onUpdated,
}: {
  surveyId: string
  address: string
  hasCoords: boolean
  onUpdated: (data: LocationUpdate) => void
}) {
  const [editing, setEditing] = useState(false)
  const [value, setValue] = useState(address)
  const [busy, setBusy] = useState(false)

  const find = async () => {
    if (!value.trim()) {
      toast.error("Enter an address")
      return
    }
    setBusy(true)
    try {
      const res = await fetch(`/api/surveys/${surveyId}/geocode`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ address: value.trim() }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || "Couldn't locate that address")
      onUpdated(data)
      setEditing(false)
      toast.success(
        data.imageryOk === false
          ? "Location updated — but the imagery couldn't be refreshed. Try again."
          : "Location updated — imagery refreshed"
      )
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Couldn't locate that address")
    } finally {
      setBusy(false)
    }
  }

  if (!editing) {
    return (
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0 flex items-start gap-1.5 text-sm text-gray-600">
          <MapPin className="w-4 h-4 text-gray-400 shrink-0 mt-0.5" />
          <span className="min-w-0">
            {address || <span className="text-gray-400">No address set</span>}
            {!hasCoords && address && (
              <span className="block text-xs text-amber-600 mt-0.5">
                Not placed on the map yet — fix the address to fetch imagery.
              </span>
            )}
          </span>
        </div>
        <button
          type="button"
          onClick={() => {
            setValue(address)
            setEditing(true)
          }}
          className="shrink-0 inline-flex items-center gap-1.5 text-sm font-semibold text-brand-blue hover:underline"
        >
          <Pencil className="w-3.5 h-3.5" /> {hasCoords ? "Wrong property?" : "Fix location"}
        </button>
      </div>
    )
  }

  return (
    <div className="space-y-2">
      <p className="text-sm text-gray-500">
        {hasCoords
          ? "Aerial or Street View on the wrong building? Re-enter the address (pick a suggestion for accuracy) and we'll relocate the pin and refresh the imagery."
          : "We couldn't place this address on the map. Add the town and postcode, pick a suggestion, and we'll fetch the imagery."}
      </p>
      <AddressInput
        value={value}
        onChange={setValue}
        placeholder="Start typing the address…"
        className="w-full px-4 py-2.5 border rounded-lg focus:outline-none focus:ring-2 focus:ring-brand-blue text-base"
      />
      <div className="flex items-center gap-3">
        <button
          type="button"
          onClick={find}
          disabled={busy}
          className="inline-flex items-center gap-2 px-4 py-2 bg-brand-blue text-white rounded-lg text-sm font-semibold hover:bg-blue-700 disabled:opacity-50"
        >
          {busy ? <Loader2 className="w-4 h-4 animate-spin" /> : <Search className="w-4 h-4" />}
          {busy ? "Locating…" : "Find property & refresh imagery"}
        </button>
        <button
          type="button"
          onClick={() => setEditing(false)}
          disabled={busy}
          className="text-sm text-gray-500 hover:underline"
        >
          Cancel
        </button>
      </div>
    </div>
  )
}
