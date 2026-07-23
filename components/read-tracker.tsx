"use client"

import { useEffect } from "react"

// Measures how long a client actively reads a shared proposal and which sections
// hold their attention, then beacons it back. Only counts time while the tab is
// visible; a section counts while it's at least half on-screen.
export function ReadTracker({ token }: { token: string }) {
  useEffect(() => {
    const sessionId =
      typeof crypto !== "undefined" && crypto.randomUUID
        ? crypto.randomUUID()
        : String(Math.random()).slice(2) + String(Date.now())

    let total = 0
    const sectionSeconds: Record<string, number> = {}
    const onScreen = new Set<string>()
    let visible = document.visibilityState === "visible"

    const io = new IntersectionObserver(
      (entries) => {
        for (const e of entries) {
          const title = (e.target as HTMLElement).dataset.trackSection || ""
          if (!title) continue
          if (e.isIntersecting && e.intersectionRatio >= 0.5) onScreen.add(title)
          else onScreen.delete(title)
        }
      },
      { threshold: [0, 0.5, 1] }
    )
    document.querySelectorAll("[data-track-section]").forEach((el) => io.observe(el))

    const tick = window.setInterval(() => {
      if (!visible) return
      total += 1
      onScreen.forEach((t) => {
        sectionSeconds[t] = (sectionSeconds[t] || 0) + 1
      })
    }, 1000)

    const send = () => {
      if (total < 2) return // ignore instant bounces
      const sections = Object.entries(sectionSeconds).map(([title, seconds]) => ({ title, seconds }))
      const payload = JSON.stringify({ sessionId, totalSeconds: total, sections })
      try {
        navigator.sendBeacon(`/api/p/${token}/track`, new Blob([payload], { type: "application/json" }))
      } catch {
        // ignore
      }
    }

    const onVis = () => {
      visible = document.visibilityState === "visible"
      if (!visible) send()
    }

    document.addEventListener("visibilitychange", onVis)
    window.addEventListener("pagehide", send)

    return () => {
      window.clearInterval(tick)
      io.disconnect()
      document.removeEventListener("visibilitychange", onVis)
      window.removeEventListener("pagehide", send)
      send()
    }
  }, [token])

  return null
}
