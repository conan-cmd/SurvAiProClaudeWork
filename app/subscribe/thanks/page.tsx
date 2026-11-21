"use client"

import { useEffect } from "react"
import { useRouter } from "next/navigation"
import { Check } from "lucide-react"
import { MetaPixel, metaTrack } from "@/components/meta-pixel"

// Post-checkout thank-you page: gives ad campaigns a stable conversion URL
// (and fires the StartTrial event) before carrying on into onboarding.
export default function SubscribeThanksPage() {
  const router = useRouter()

  useEffect(() => {
    metaTrack("StartTrial")
    const t = setTimeout(() => router.replace("/onboarding/branding"), 2500)
    return () => clearTimeout(t)
  }, [router])

  return (
    <div className="min-h-screen bg-gradient-to-b from-brand-navy to-blue-50 flex items-center justify-center p-4">
      <MetaPixel />
      <div className="w-full max-w-md bg-white rounded-2xl shadow-xl p-8 text-center space-y-4">
        <div className="mx-auto w-14 h-14 rounded-full bg-emerald-100 flex items-center justify-center">
          <Check className="w-7 h-7 text-emerald-600" />
        </div>
        <h1 className="text-2xl font-bold text-brand-navy">You&apos;re in! 🎉</h1>
        <p className="text-gray-600">
          Your free trial has started — let&apos;s set up your branding so your first proposal looks the part.
        </p>
        <button
          onClick={() => router.replace("/onboarding/branding")}
          className="w-full py-2.5 bg-brand-blue text-white font-semibold rounded-lg hover:bg-blue-700 transition"
        >
          Set up my account →
        </button>
      </div>
    </div>
  )
}
