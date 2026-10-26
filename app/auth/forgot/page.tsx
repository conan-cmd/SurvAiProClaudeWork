"use client"

import { useState } from "react"
import Link from "next/link"
import { toast } from "sonner"
import { Loader2, MailCheck } from "lucide-react"

export default function ForgotPasswordPage() {
  const [email, setEmail] = useState("")
  const [busy, setBusy] = useState(false)
  const [sent, setSent] = useState(false)

  const submit = async (e: React.FormEvent) => {
    e.preventDefault()
    setBusy(true)
    try {
      const res = await fetch("/api/auth/forgot", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email }),
      })
      if (!res.ok) throw new Error((await res.json()).error)
      setSent(true)
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Something went wrong — try again")
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="min-h-screen bg-gradient-to-b from-brand-navy to-blue-50 flex items-center justify-center p-4">
      <div className="w-full max-w-md">
        <div className="bg-white rounded-xl shadow-lg p-8">
          {sent ? (
            <div className="text-center py-4">
              <MailCheck className="w-10 h-10 text-emerald-500 mx-auto mb-3" />
              <h1 className="text-2xl font-bold text-brand-navy mb-2">Check your inbox</h1>
              <p className="text-gray-600 text-sm">
                If an account exists for <strong>{email}</strong>, a reset link is on its way.
                It works for one hour — check spam if it doesn&apos;t arrive.
              </p>
            </div>
          ) : (
            <>
              <h1 className="text-3xl font-bold text-brand-navy mb-2">Reset password</h1>
              <p className="text-gray-600 mb-6">
                Enter your account email and we&apos;ll send you a link to set a new password.
              </p>
              <form onSubmit={submit} className="space-y-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Email Address</label>
                  <input type="email" value={email} onChange={(e) => setEmail(e.target.value)}
                    placeholder="you@company.com" required autoFocus
                    className="w-full px-4 py-2 border rounded-lg focus:outline-none focus:ring-2 focus:ring-brand-blue" />
                </div>
                <button type="submit" disabled={busy}
                  className="w-full inline-flex items-center justify-center gap-2 py-2.5 bg-brand-blue text-white rounded-lg font-semibold hover:bg-blue-700 disabled:opacity-50">
                  {busy && <Loader2 className="w-4 h-4 animate-spin" />} Send reset link
                </button>
              </form>
            </>
          )}
          <p className="text-sm text-gray-500 mt-6 text-center">
            <Link href="/auth/login" className="text-brand-blue font-medium hover:underline">Back to sign in</Link>
          </p>
        </div>
      </div>
    </div>
  )
}
