"use client"

import { useEffect } from "react"
import { useRouter } from "next/navigation"

// Quiet background BigChange sync fired when the Surveys page opens (the
// server throttles to one real run per 10 minutes). Refreshes the list when
// new bookings actually arrived; silent otherwise.
export function BigChangeAutoSync() {
  const router = useRouter()
  useEffect(() => {
    // Due scheduled follow-ups go out on any page load too, not just the cron.
    fetch("/api/cron/nudges", { method: "POST" }).catch(() => {})
    fetch("/api/bigchange/sync?auto=1", { method: "POST" })
      .then((r) => (r.ok ? r.json() : null))
      .then((j) => {
        if (j && typeof j.imported === "number" && j.imported > 0) router.refresh()
      })
      .catch(() => {})
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])
  return null
}
