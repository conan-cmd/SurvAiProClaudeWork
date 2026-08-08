import { notFound } from "next/navigation"
import Link from "next/link"
import { getCurrentUser } from "@/lib/session"
import { isPlatformAdmin } from "@/lib/admin"
import { db } from "@/lib/db"

export const dynamic = "force-dynamic"

function rel(d: Date | null): string {
  if (!d) return "never"
  const mins = Math.round((Date.now() - d.getTime()) / 60000)
  if (mins < 1) return "just now"
  if (mins < 60) return `${mins}m ago`
  const hrs = Math.round(mins / 60)
  if (hrs < 24) return `${hrs}h ago`
  return `${Math.round(hrs / 24)}d ago`
}
const fmtDate = (d: Date) =>
  new Intl.DateTimeFormat("en-GB", { day: "numeric", month: "short", year: "numeric" }).format(d)

type OrgRow = {
  billingExempt: boolean
  freeAccess: boolean
  cryptoAccessUntil: Date | null
  subscriptionStatus: string | null
}
function statusLabel(o: OrgRow): string {
  if (o.billingExempt) return "Comped"
  if (o.freeAccess) return "Free (code)"
  if (o.cryptoAccessUntil && o.cryptoAccessUntil.getTime() > Date.now()) return "Bitcoin (annual)"
  return o.subscriptionStatus || "—"
}

export default async function AdminUsagePage() {
  const user = await getCurrentUser()
  if (!isPlatformAdmin(user)) notFound()

  const orgs = await db.organization.findMany({
    orderBy: { createdAt: "desc" },
    select: {
      id: true, name: true, createdAt: true,
      subscriptionStatus: true, billingExempt: true, freeAccess: true,
      cryptoAccessUntil: true, isFoundingMember: true,
      users: {
        select: { email: true, name: true, role: true, lastLoginAt: true, lastActiveAt: true },
        orderBy: { createdAt: "asc" },
      },
      _count: { select: { surveys: true, proposals: true, rams: true } },
    },
  })

  const maxDate = (ds: (Date | null)[]): Date | null => {
    const t = ds.filter((d): d is Date => !!d).map((d) => d.getTime())
    return t.length ? new Date(Math.max(...t)) : null
  }

  const totalProposals = orgs.reduce((s, o) => s + o._count.proposals, 0)

  return (
    <div className="max-w-5xl mx-auto space-y-5">
      <div className="flex items-center justify-between gap-3">
        <div>
          <h1 className="text-xl font-bold text-brand-navy">Admin · Usage</h1>
          <p className="text-sm text-gray-500">
            {orgs.length} account{orgs.length !== 1 ? "s" : ""} · {totalProposals} proposal{totalProposals !== 1 ? "s" : ""} generated in total.
          </p>
        </div>
        <Link href="/admin" className="text-sm text-brand-blue hover:underline whitespace-nowrap">← Access codes</Link>
      </div>

      <div className="bg-white rounded-xl shadow-sm overflow-x-auto">
        <table className="w-full text-sm whitespace-nowrap">
          <thead>
            <tr className="text-left text-gray-400 border-b">
              <th className="p-3 font-medium">Account</th>
              <th className="p-3 font-medium">Status</th>
              <th className="p-3 font-medium">Joined</th>
              <th className="p-3 font-medium">Last login</th>
              <th className="p-3 font-medium">Last active</th>
              <th className="p-3 font-medium text-right">Surveys</th>
              <th className="p-3 font-medium text-right">Proposals</th>
              <th className="p-3 font-medium text-right">RAMS</th>
            </tr>
          </thead>
          <tbody>
            {orgs.map((o) => {
              const owner = o.users.find((u) => u.role === "OWNER") || o.users[0]
              const lastLogin = maxDate(o.users.map((u) => u.lastLoginAt))
              const lastActive = maxDate(o.users.map((u) => u.lastActiveAt))
              return (
                <tr key={o.id} className="border-b border-gray-100">
                  <td className="p-3">
                    <div className="font-medium text-gray-900">{o.name}{o.isFoundingMember ? " ⭐" : ""}</div>
                    <div className="text-xs text-gray-500">
                      {owner?.name || owner?.email || "—"}{o.users.length > 1 ? ` +${o.users.length - 1} team` : ""}
                    </div>
                  </td>
                  <td className="p-3 text-gray-600">{statusLabel(o)}</td>
                  <td className="p-3 text-gray-500">{fmtDate(o.createdAt)}</td>
                  <td className="p-3 text-gray-500">{rel(lastLogin)}</td>
                  <td className="p-3 text-gray-500">{rel(lastActive)}</td>
                  <td className="p-3 text-right text-gray-700">{o._count.surveys}</td>
                  <td className="p-3 text-right font-semibold text-brand-navy">{o._count.proposals}</td>
                  <td className="p-3 text-right text-gray-700">{o._count.rams}</td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>

      <p className="text-xs text-gray-400">
        &quot;Last active&quot; updates as a user moves around the app (to the nearest few minutes). New columns start filling in from now — accounts that haven&apos;t signed in since this was added show &quot;never&quot; until their next visit.
      </p>
    </div>
  )
}
