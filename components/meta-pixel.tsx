"use client"

import { useEffect } from "react"

// Meta (Facebook) Pixel for ad-campaign tracking. Mounted only on the public
// marketing/signup surfaces — never inside the authed app or on client-facing
// proposal pages, so customers' clients are never third-party-tracked.
// Disabled entirely unless NEXT_PUBLIC_META_PIXEL_ID is set.

declare global {
  interface Window {
    fbq?: ((...args: unknown[]) => void) & { queue?: unknown[]; loaded?: boolean }
    _fbq?: unknown
  }
}

// The pixel id is a public identifier (visible in any page source); the env
// var can override it per-deployment.
const PIXEL_ID = process.env.NEXT_PUBLIC_META_PIXEL_ID || "1065337965918378"

export function metaTrack(event: string, params?: Record<string, unknown>) {
  try {
    if (PIXEL_ID && typeof window !== "undefined" && window.fbq) {
      window.fbq("track", event, params)
    }
  } catch {
    /* tracking must never break the app */
  }
}

export function MetaPixel() {
  useEffect(() => {
    if (!PIXEL_ID || typeof window === "undefined") return
    if (!window.fbq) {
      // Standard Meta base code, minus document.write variants.
      const fbq: Window["fbq"] = (...args: unknown[]) => {
        ;(fbq as { queue?: unknown[] }).queue?.push(args)
      }
      ;(fbq as { queue?: unknown[] }).queue = []
      ;(fbq as { loaded?: boolean }).loaded = true
      window.fbq = fbq
      window._fbq = fbq
      const script = document.createElement("script")
      script.async = true
      script.src = "https://connect.facebook.net/en_US/fbevents.js"
      document.head.appendChild(script)
      window.fbq("init", PIXEL_ID)
    }
    window.fbq("track", "PageView")
  }, [])
  return null
}
