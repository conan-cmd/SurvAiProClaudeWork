"use client"

import { useState } from "react"
import { signOut } from "next-auth/react"
import { toast } from "sonner"
import { Loader2, AtSign } from "lucide-react"

// Change the login email (e.g. an account set up on someone else's address
// being handed to its real owner). Password-confirmed; on success the session
// ends and they sign back in with the new address.
export function ChangeEmail({ currentEmail }: { currentEmail: string }) {
  const [open, setOpen] = useState(false)
  const [newEmail, setNewEmail] = useState("")
  const [password, setPassword] = useState("")
  const [busy, setBusy] = useState(false)

  const submit = async () => {
    setBusy(true)
    try {
      const res = await fetch("/api/me/change-email", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ newEmail: newEmail.trim(), password }),
      })
      const d = await res.json()
      if (!res.ok) throw new Error(d.error)
      toast.success("Email changed — sign in again with the new address")
      await signOut({ callbackUrl: "/auth/login" })
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Couldn't change the email")
      setBusy(false)
    }
  }

  return (
    <div className="space-y-3">
      <p className="text-sm text-gray-600">
        You sign in as <span className="font-medium text-gray-800">{currentEmail}</span>.
      </p>
      {!open ? (
        <button type="button" onClick={() => setOpen(true)}
          className="inline-flex items-center gap-1.5 text-sm font-medium text-brand-blue hover:underline">
          <AtSign className="w-4 h-4" /> Change my login email
        </button>
      ) : (
        <div className="space-y-2 max-w-md">
          <input type="email" value={newEmail} onChange={(e) => setNewEmail(e.target.value)}
            placeholder="new@email.co.uk" autoComplete="off"
            className="w-full text-sm px-3 py-2 border rounded-lg focus:outline-none focus:ring-2 focus:ring-brand-blue/30" />
          <input type="password" value={password} onChange={(e) => setPassword(e.target.value)}
            placeholder="Current password (to confirm it's you)" autoComplete="current-password"
            className="w-full text-sm px-3 py-2 border rounded-lg focus:outline-none focus:ring-2 focus:ring-brand-blue/30" />
          <p className="text-xs text-gray-400">
            You&apos;ll be signed out and sign back in with the new address. Your password stays the same.
          </p>
          <div className="flex gap-2">
            <button type="button" onClick={() => setOpen(false)} disabled={busy}
              className="px-3 py-2 border rounded-lg text-sm font-medium hover:bg-gray-50">Cancel</button>
            <button type="button" onClick={submit} disabled={busy || !newEmail.trim() || !password}
              className="inline-flex items-center gap-2 px-4 py-2 bg-brand-navy text-white rounded-lg text-sm font-semibold hover:opacity-90 disabled:opacity-50">
              {busy && <Loader2 className="w-4 h-4 animate-spin" />} Change email
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
