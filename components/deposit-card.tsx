"use client"

import { useState } from "react"
import { Loader2, Lock } from "lucide-react"

// Shown on the share page after signing, when a deposit is due.
export function DepositCard({
  token,
  amountLabel,
  brandColor,
}: {
  token: string
  amountLabel: string
  brandColor: string
}) {
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const pay = async () => {
    setLoading(true)
    setError(null)
    try {
      const res = await fetch(`/api/p/${token}/pay`, { method: "POST" })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error)
      window.location.href = data.url
    } catch (e) {
      setError(e instanceof Error ? e.message : "Payment couldn't start - please try again")
      setLoading(false)
    }
  }

  return (
    <div className="mt-6 border-2 rounded-xl p-6" style={{ borderColor: brandColor }}>
      <h3 className="text-lg font-bold text-gray-900 mb-1">Secure your booking</h3>
      <p className="text-sm text-gray-600 mb-4">
        A deposit of <strong>{amountLabel}</strong> confirms your acceptance and secures
        your place in the schedule. The remaining balance is due on completion.
      </p>
      <button
        type="button"
        onClick={pay}
        disabled={loading}
        className="w-full sm:w-auto inline-flex items-center justify-center gap-2 px-8 py-3 rounded-lg font-bold text-white disabled:opacity-60"
        style={{ backgroundColor: brandColor }}
      >
        {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Lock className="w-4 h-4" />}
        {loading ? "Opening secure payment…" : `Pay deposit ${amountLabel}`}
      </button>
      {error && <p className="text-sm text-red-600 mt-3">{error}</p>}
      <p className="text-[11px] text-gray-400 mt-2">
        Payments are processed securely by Stripe. Card, Apple Pay and Google Pay accepted.
      </p>
    </div>
  )
}
