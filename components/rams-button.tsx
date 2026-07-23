"use client"

import { useState } from "react"
import { useRouter } from "next/navigation"
import { toast } from "sonner"
import { ShieldAlert, Loader2 } from "lucide-react"

// Opens the job's RAMS, drafting one with AI on first use. Used from the survey
// and the proposal so Survey / Proposal / RAMS all link to the same job.
export function RamsButton({ surveyId, className }: { surveyId: string; className?: string }) {
  const router = useRouter()
  const [loading, setLoading] = useState(false)

  const open = async () => {
    setLoading(true)
    try {
      const existing = await fetch(`/api/surveys/${surveyId}/rams`).then((r) => r.json())
      if (existing?.ramsId) {
        router.push(`/rams/${existing.ramsId}`)
        return
      }
      toast.info("Drafting your RAMS — this takes a moment…")
      const res = await fetch(`/api/surveys/${surveyId}/rams`, { method: "POST" })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || "Failed to draft RAMS")
      router.push(`/rams/${data.id}`)
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Couldn't open RAMS")
      setLoading(false)
    }
  }

  return (
    <button onClick={open} disabled={loading} className={className}>
      {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <ShieldAlert className="w-4 h-4" />}
      RAMS
    </button>
  )
}
