import { notFound } from "next/navigation"
import { getCurrentUser } from "@/lib/session"
import { isPlatformAdmin } from "@/lib/admin"
import { CodesManager } from "@/components/codes-manager"

export const dynamic = "force-dynamic"

export default async function AdminPage() {
  const user = await getCurrentUser()
  if (!isPlatformAdmin(user)) notFound()

  return (
    <div className="max-w-3xl mx-auto space-y-5">
      <div>
        <h1 className="text-xl font-bold text-brand-navy">Admin · Access codes</h1>
        <p className="text-sm text-gray-500">Create free-access codes for testers. Revoke any time to remove their access.</p>
      </div>
      <CodesManager />
    </div>
  )
}
