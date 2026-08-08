import { notFound } from "next/navigation"
import Link from "next/link"
import { BarChart3 } from "lucide-react"
import { getCurrentUser } from "@/lib/session"
import { isPlatformAdmin } from "@/lib/admin"
import { CodesManager } from "@/components/codes-manager"

export const dynamic = "force-dynamic"

export default async function AdminPage() {
  const user = await getCurrentUser()
  if (!isPlatformAdmin(user)) notFound()

  return (
    <div className="max-w-3xl mx-auto space-y-5">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h1 className="text-xl font-bold text-brand-navy">Admin · Access codes</h1>
          <p className="text-sm text-gray-500">Create free-access codes for testers. Revoke any time to remove their access.</p>
        </div>
        <Link href="/admin/usage"
          className="shrink-0 inline-flex items-center gap-1.5 px-3 py-2 border rounded-lg text-sm font-medium bg-white hover:bg-gray-50">
          <BarChart3 className="w-4 h-4" /> Usage
        </Link>
      </div>
      <CodesManager />
    </div>
  )
}
