"use client"

import { useEffect } from "react"

// Keeps an open (visible) tab counted as "online": pings a lightweight route
// every 4 minutes — getCurrentUser stamps User.lastActiveAt (itself throttled
// to one DB write per 5 minutes), which the team presence display reads.
export function PresencePing() {
  useEffect(() => {
    const ping = () => {
      if (document.visibilityState !== "visible") return
      fetch("/api/me/heartbeat", { method: "POST" }).catch(() => {})
    }
    const t = setInterval(ping, 4 * 60 * 1000)
    document.addEventListener("visibilitychange", ping)
    return () => {
      clearInterval(t)
      document.removeEventListener("visibilitychange", ping)
    }
  }, [])
  return null
}
