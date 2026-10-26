"use client"

import { useEffect, useState } from "react"
import Link from "next/link"
import { CheckCircle2, Circle, X } from "lucide-react"

type Steps = {
  branding: boolean
  stripe: boolean
  survey: boolean
  sent: boolean
}

// First-week checklist on the dashboard — the shortest path from fresh
// account to first proposal sent. Dismiss is per-device; it also disappears
// by itself once every step is done.
export function GettingStarted({ steps }: { steps: Steps }) {
  const [dismissed, setDismissed] = useState(true)
  useEffect(() => {
    try {
      setDismissed(localStorage.getItem("gettingStartedDismissed") === "1")
    } catch {
      setDismissed(false)
    }
  }, [])

  const items: { done: boolean; label: string; href: string }[] = [
    { done: steps.branding, label: "Add your logo & company details", href: "/onboarding/branding" },
    { done: steps.stripe, label: "Connect Stripe so deposits pay you", href: "/settings" },
    { done: steps.survey, label: "Create your first survey", href: "/surveys/new" },
    { done: steps.sent, label: "Generate & send your first proposal", href: "/surveys" },
  ]
  const remaining = items.filter((i) => !i.done).length
  if (dismissed || remaining === 0) return null

  const dismiss = () => {
    setDismissed(true)
    try {
      localStorage.setItem("gettingStartedDismissed", "1")
    } catch {
      /* fine */
    }
  }

  return (
    <div className="bg-white border border-blue-200 rounded-xl shadow-sm p-4">
      <div className="flex items-center justify-between mb-2">
        <p className="font-semibold text-brand-navy text-sm">
          Getting started — {items.length - remaining} of {items.length} done
        </p>
        <button onClick={dismiss} aria-label="Dismiss checklist"
          className="p-1 text-gray-300 hover:text-gray-500"><X className="w-4 h-4" /></button>
      </div>
      <ul className="grid sm:grid-cols-2 gap-x-6 gap-y-1.5">
        {items.map((i) => (
          <li key={i.label}>
            {i.done ? (
              <span className="flex items-center gap-2 text-sm text-gray-400 line-through">
                <CheckCircle2 className="w-4 h-4 text-emerald-500 shrink-0" /> {i.label}
              </span>
            ) : (
              <Link href={i.href} className="flex items-center gap-2 text-sm font-medium text-gray-700 hover:text-brand-blue">
                <Circle className="w-4 h-4 text-gray-300 shrink-0" /> {i.label}
              </Link>
            )}
          </li>
        ))}
      </ul>
    </div>
  )
}
