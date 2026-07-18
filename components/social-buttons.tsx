"use client"

import { useEffect, useState } from "react"
import { signIn } from "next-auth/react"

// Renders Google / Apple buttons only for providers actually configured
export function SocialButtons() {
  const [providers, setProviders] = useState<string[]>([])

  useEffect(() => {
    fetch("/api/auth/providers")
      .then((r) => r.json())
      .then((data) => setProviders(Object.keys(data || {})))
      .catch(() => {})
  }, [])

  const hasGoogle = providers.includes("google")
  const hasApple = providers.includes("apple")
  if (!hasGoogle && !hasApple) return null

  return (
    <div className="space-y-3 mb-6">
      {hasGoogle && (
        <button
          type="button"
          onClick={() => signIn("google", { callbackUrl: "/dashboard" })}
          className="w-full flex items-center justify-center gap-3 py-2.5 border rounded-lg font-medium text-gray-700 hover:bg-gray-50 transition"
        >
          <svg className="w-5 h-5" viewBox="0 0 24 24" aria-hidden>
            <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92a5.06 5.06 0 0 1-2.2 3.32v2.77h3.57c2.08-1.92 3.27-4.74 3.27-8.1z"/>
            <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84A11 11 0 0 0 12 23z"/>
            <path fill="#FBBC05" d="M5.84 14.1a6.6 6.6 0 0 1 0-4.2V7.06H2.18a11 11 0 0 0 0 9.88l3.66-2.84z"/>
            <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15A11 11 0 0 0 2.18 7.06l3.66 2.84c.87-2.6 3.3-4.52 6.16-4.52z"/>
          </svg>
          Continue with Google
        </button>
      )}
      {hasApple && (
        <button
          type="button"
          onClick={() => signIn("apple", { callbackUrl: "/dashboard" })}
          className="w-full flex items-center justify-center gap-3 py-2.5 bg-black text-white rounded-lg font-medium hover:bg-gray-900 transition"
        >
          <svg className="w-5 h-5" viewBox="0 0 24 24" fill="currentColor" aria-hidden>
            <path d="M17.05 20.28c-.98.95-2.05.8-3.08.35-1.09-.46-2.09-.48-3.24 0-1.44.62-2.2.44-3.06-.35C2.79 15.25 3.51 7.59 9.05 7.31c1.35.07 2.29.74 3.08.8.98-.2 1.92-.9 3.08-.82 1.4.11 2.44.66 3.14 1.66-2.9 1.74-2.42 5.55.5 6.7-.53 1.4-1.21 2.78-1.8 4.63zM12.03 7.25c-.15-2.23 1.66-4.07 3.74-4.25.29 2.58-2.34 4.5-3.74 4.25z"/>
          </svg>
          Continue with Apple
        </button>
      )}
      <div className="flex items-center gap-3 text-xs text-gray-400">
        <div className="flex-1 border-t" /> or with email <div className="flex-1 border-t" />
      </div>
    </div>
  )
}
