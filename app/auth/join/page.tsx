"use client"

import { Suspense, useEffect, useState } from "react"
import { useRouter, useSearchParams } from "next/navigation"
import { signIn } from "next-auth/react"
import { toast } from "sonner"

function JoinForm() {
  const router = useRouter()
  const token = useSearchParams().get("token") || ""
  const [info, setInfo] = useState<{ email: string; organization: string } | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [name, setName] = useState("")
  const [password, setPassword] = useState("")
  const [loading, setLoading] = useState(false)

  useEffect(() => {
    fetch(`/api/team/join?token=${encodeURIComponent(token)}`)
      .then(async (r) => {
        const data = await r.json()
        if (!r.ok) throw new Error(data.error)
        setInfo(data)
      })
      .catch((e) => setError(e instanceof Error ? e.message : "Invalid invite"))
  }, [token])

  const submit = async (e: React.FormEvent) => {
    e.preventDefault()
    setLoading(true)
    try {
      const res = await fetch("/api/team/join", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token, name, password }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error)
      await signIn("credentials", { email: data.email, password, redirect: false })
      toast.success(`Welcome to ${data.organization}! Add your sign-off in Settings.`)
      router.push("/settings")
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to join")
      setLoading(false)
    }
  }

  const input = "w-full px-4 py-2.5 border rounded-lg focus:outline-none focus:ring-2 focus:ring-brand-blue"

  return (
    <div className="min-h-screen bg-gradient-to-b from-brand-navy to-blue-50 flex items-center justify-center p-4">
      <div className="w-full max-w-md bg-white rounded-xl shadow-lg p-8">
        {error ? (
          <p className="text-center text-red-600">{error}</p>
        ) : !info ? (
          <p className="text-center text-gray-400">Checking your invite…</p>
        ) : (
          <>
            <h1 className="text-2xl font-bold text-brand-navy mb-1">Join {info.organization}</h1>
            <p className="text-gray-600 mb-6 text-sm">
              You&apos;re joining as <strong>{info.email}</strong>
            </p>
            <form onSubmit={submit} className="space-y-4">
              <input className={input} placeholder="Your full name" value={name}
                onChange={(e) => setName(e.target.value)} required />
              <input className={input} type="password" placeholder="Choose a password (8+ characters)"
                value={password} onChange={(e) => setPassword(e.target.value)} required />
              <button type="submit" disabled={loading}
                className="w-full py-2.5 bg-brand-blue text-white font-semibold rounded-lg hover:bg-blue-700 disabled:opacity-50">
                {loading ? "Joining…" : "Join the team"}
              </button>
            </form>
          </>
        )}
      </div>
    </div>
  )
}

export default function JoinPage() {
  return (
    <Suspense>
      <JoinForm />
    </Suspense>
  )
}
