"use client"

import { useState } from "react"
import { useParams, useRouter } from "next/navigation"
import Link from "next/link"
import { toast } from "sonner"
import { Loader2 } from "lucide-react"

export default function ResetPasswordPage() {
  const { token } = useParams<{ token: string }>()
  const router = useRouter()
  const [password, setPassword] = useState("")
  const [confirm, setConfirm] = useState("")
  const [busy, setBusy] = useState(false)

  const submit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (password !== confirm) {
      toast.error("Passwords don't match")
      return
    }
    setBusy(true)
    try {
      const res = await fetch("/api/auth/reset", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token, password }),
      })
      const d = await res.json()
      if (!res.ok) throw new Error(d.error)
      toast.success("Password updated — sign in with your new password")
      router.push("/auth/login")
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Couldn't reset the password")
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="min-h-screen bg-gradient-to-b from-brand-navy to-blue-50 flex items-center justify-center p-4">
      <div className="w-full max-w-md">
        <div className="bg-white rounded-xl shadow-lg p-8">
          <h1 className="text-3xl font-bold text-brand-navy mb-2">Set a new password</h1>
          <p className="text-gray-600 mb-6">Choose a new password for your account.</p>
          <form onSubmit={submit} className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">New password</label>
              <input type="password" value={password} onChange={(e) => setPassword(e.target.value)}
                placeholder="At least 8 characters" required minLength={8} autoFocus
                className="w-full px-4 py-2 border rounded-lg focus:outline-none focus:ring-2 focus:ring-brand-blue" />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Confirm new password</label>
              <input type="password" value={confirm} onChange={(e) => setConfirm(e.target.value)}
                placeholder="••••••••" required minLength={8}
                className="w-full px-4 py-2 border rounded-lg focus:outline-none focus:ring-2 focus:ring-brand-blue" />
            </div>
            <button type="submit" disabled={busy}
              className="w-full inline-flex items-center justify-center gap-2 py-2.5 bg-brand-blue text-white rounded-lg font-semibold hover:bg-blue-700 disabled:opacity-50">
              {busy && <Loader2 className="w-4 h-4 animate-spin" />} Update password
            </button>
          </form>
          <p className="text-sm text-gray-500 mt-6 text-center">
            Link expired?{" "}
            <Link href="/auth/forgot" className="text-brand-blue font-medium hover:underline">Request a new one</Link>
          </p>
        </div>
      </div>
    </div>
  )
}
