"use client"

import { useState } from "react"
import Link from "next/link"
import { Sparkles, X, ArrowRight } from "lucide-react"

// Gentle dashboard reminder shown to businesses that skipped first-run setup
// (or signed up via Google, bypassing the wizard). "Dismiss" marks it done.
export function OnboardingNudge() {
  const [hidden, setHidden] = useState(false)
  if (hidden) return null

  const dismiss = () => {
    setHidden(true)
    fetch("/api/organization", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ onboardingComplete: true }),
    }).catch(() => {})
  }

  return (
    <div className="relative bg-gradient-to-r from-brand-navy to-blue-700 text-white rounded-xl p-5 pr-10">
      <button onClick={dismiss} aria-label="Dismiss"
        className="absolute top-3 right-3 text-white/60 hover:text-white">
        <X className="w-4 h-4" />
      </button>
      <div className="flex items-start gap-3">
        <Sparkles className="w-5 h-5 mt-0.5 shrink-0" />
        <div>
          <div className="font-semibold">Finish setting up your account</div>
          <p className="text-sm text-white/80 mt-0.5">
            Add your logo, brand colours and services so every proposal looks polished and on-brand.
          </p>
          <Link href="/onboarding/branding"
            className="inline-flex items-center gap-1.5 mt-3 bg-white text-brand-navy text-sm font-semibold px-4 py-2 rounded-lg hover:bg-gray-100">
            Set up now <ArrowRight className="w-4 h-4" />
          </Link>
        </div>
      </div>
    </div>
  )
}
