"use client"

import { signOut } from "next-auth/react"
import { LogOut } from "lucide-react"

// Signs the user out and returns them to the login screen. `iconOnly` renders a
// compact icon (for the header); otherwise a full labelled button (for Settings).
export function SignOutButton({ iconOnly = false, className }: { iconOnly?: boolean; className?: string }) {
  const doSignOut = () => signOut({ callbackUrl: "/auth/login" })

  if (iconOnly) {
    return (
      <button onClick={doSignOut} aria-label="Sign out" title="Sign out"
        className={className || "text-gray-300 hover:text-white p-1.5 rounded-md hover:bg-white/10"}>
        <LogOut className="w-4 h-4" />
      </button>
    )
  }

  return (
    <button onClick={doSignOut}
      className={className || "inline-flex items-center gap-2 px-4 py-2 border rounded-lg text-sm font-medium text-gray-700 hover:bg-gray-50"}>
      <LogOut className="w-4 h-4" /> Sign out
    </button>
  )
}
