"use client"

import { useState } from "react"
import { toast } from "sonner"
import { Loader2, Webhook } from "lucide-react"

// Fires a sample trial_started event at GoHighLevel so the field mapping can be
// completed. Shown on the admin page.
export function GhlTestButton({ enabled }: { enabled: boolean }) {
  const [busy, setBusy] = useState(false)

  const fire = async () => {
    setBusy(true)
    try {
      const res = await fetch("/api/admin/ghl-test", { method: "POST" })
      const d = await res.json()
      if (!res.ok) throw new Error(d.error)
      toast.success("Test 'trial_started' event sent to GoHighLevel")
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Couldn't send the test event")
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="bg-white rounded-xl shadow-sm p-5">
      <h2 className="font-semibold text-brand-navy mb-1">GoHighLevel test event</h2>
      <p className="text-sm text-gray-500 mb-3">
        {enabled
          ? "Sends a sample trial_started payload to your GHL inbound webhook so the workflow fields can be mapped."
          : "Set GHL_WEBHOOK_URL in the host environment (Vercel) first, then this will light up."}
      </p>
      <button onClick={fire} disabled={busy || !enabled}
        className="inline-flex items-center gap-1.5 px-4 py-2 bg-brand-blue text-white rounded-lg text-sm font-semibold hover:bg-blue-700 disabled:opacity-50">
        {busy ? <Loader2 className="w-4 h-4 animate-spin" /> : <Webhook className="w-4 h-4" />}
        Send test event
      </button>
    </div>
  )
}
