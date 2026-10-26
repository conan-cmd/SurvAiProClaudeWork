"use client"

import * as Sentry from "@sentry/nextjs"
import { useEffect } from "react"

// Last-resort error screen for unhandled client crashes — reports to Sentry
// and gives the user a way back instead of a white page.
export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string }
  reset: () => void
}) {
  useEffect(() => {
    Sentry.captureException(error)
  }, [error])

  return (
    <html lang="en">
      <body style={{ fontFamily: "system-ui, sans-serif", background: "#f8fafc" }}>
        <div style={{ maxWidth: 420, margin: "20vh auto", textAlign: "center", padding: 24 }}>
          <h1 style={{ color: "#0f172a", fontSize: 22, marginBottom: 8 }}>Something went wrong</h1>
          <p style={{ color: "#64748b", fontSize: 15, marginBottom: 20 }}>
            That&apos;s on us — it&apos;s been reported automatically. Try again, and if it keeps
            happening, use the Feedback button to tell us what you were doing.
          </p>
          <button onClick={reset}
            style={{ background: "#2563EB", color: "#fff", border: 0, borderRadius: 8, padding: "10px 24px", fontSize: 15, fontWeight: 600, cursor: "pointer" }}>
            Try again
          </button>
        </div>
      </body>
    </html>
  )
}
