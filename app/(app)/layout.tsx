import Link from "next/link"
import { redirect } from "next/navigation"
import { getCurrentUser } from "@/lib/session"
import { hasActiveAccess } from "@/lib/billing"
import { isApprover } from "@/lib/permissions"
import { db } from "@/lib/db"
import { FeedbackButton } from "@/components/feedback-button"
import { SignOutButton } from "@/components/sign-out-button"
import { LayoutDashboard, ClipboardList, FileText, Users, Images, Settings, ShieldAlert, ClipboardCheck } from "lucide-react"

type NavItem = { href: string; label: string; icon: typeof LayoutDashboard; badge?: number }

const BASE_NAV: NavItem[] = [
  { href: "/dashboard", label: "Dashboard", icon: LayoutDashboard },
  { href: "/surveys", label: "Surveys", icon: ClipboardList },
  { href: "/proposals", label: "Proposals", icon: FileText },
  { href: "/rams", label: "RAMS", icon: ShieldAlert },
  { href: "/customers", label: "Customers", icon: Users },
  { href: "/gallery", label: "Gallery", icon: Images },
  { href: "/settings", label: "Settings", icon: Settings },
]

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const user = await getCurrentUser()
  if (!user) redirect("/auth/login")
  // No active subscription (and not exempt) → send to the paywall.
  if (!hasActiveAccess(user.organization)) redirect("/subscribe")

  // Approvers get a Reviews tab with a count of proposals awaiting sign-off.
  const approver = isApprover(user)
  const pendingReviews = approver
    ? await db.proposal.count({ where: { organizationId: user.organizationId, approvalStatus: "PENDING" } })
    : 0
  const NAV: NavItem[] = approver
    ? [
        ...BASE_NAV.slice(0, 3),
        { href: "/reviews", label: "Reviews", icon: ClipboardCheck, badge: pendingReviews },
        ...BASE_NAV.slice(3),
      ]
    : BASE_NAV
  // Mobile bottom bar drops Gallery (stays in the top nav) to keep the bar compact.
  const MOBILE_NAV = NAV.filter((n) => n.href !== "/gallery")

  return (
    <div className="min-h-screen bg-brand-gray">
      {/* Top bar (desktop) / header (mobile) */}
      <header className="bg-brand-navy text-white sticky top-0 z-40">
        <div className="max-w-6xl mx-auto flex items-center justify-between px-4 h-14">
          <Link href="/dashboard" className="font-bold text-lg tracking-tight">
            Surv<span className="text-brand-green">AI</span>Pro
          </Link>
          <nav className="hidden md:flex items-center gap-1">
            {NAV.map(({ href, label, badge }) => (
              <Link
                key={href}
                href={href}
                className="relative px-3 py-1.5 rounded-md text-sm text-gray-200 hover:bg-white/10 hover:text-white transition"
              >
                {label}
                {badge ? (
                  <span className="ml-1.5 inline-flex items-center justify-center min-w-[18px] h-[18px] px-1 rounded-full bg-brand-green text-brand-navy text-[11px] font-bold align-middle">
                    {badge}
                  </span>
                ) : null}
              </Link>
            ))}
          </nav>
          <div className="flex items-center gap-1.5">
            <span className="text-sm text-gray-300 truncate max-w-[110px] md:max-w-[140px]">
              {user.organization.name}
            </span>
            <SignOutButton iconOnly />
          </div>
        </div>
      </header>

      {user.organization.subscriptionStatus === "trialing" && user.organization.currentPeriodEnd && (() => {
        const days = Math.max(0, Math.ceil((user.organization.currentPeriodEnd.getTime() - Date.now()) / 86400000))
        const price = user.organization.isFoundingMember ? "£79/mo" : "£149/mo"
        return (
          <div className="no-print bg-amber-50 border-b border-amber-200 text-amber-800 text-sm text-center py-2 px-4">
            ⏳ <strong>{days} day{days !== 1 ? "s" : ""} left</strong> in your free trial — then {price}
            {user.organization.isFoundingMember ? " (founding price, locked for life)" : ""}.{" "}
            <Link href="/settings" className="underline font-medium">Manage</Link>
          </div>
        )
      })()}

      <main className="max-w-6xl mx-auto px-4 py-6 pb-24 md:pb-10">{children}</main>

      <FeedbackButton founding={user.organization.isFoundingMember} />

      {/* Bottom tab bar (mobile) */}
      <nav className="md:hidden fixed bottom-0 inset-x-0 bg-white border-t z-40 overflow-hidden">
        <div className="grid" style={{ gridTemplateColumns: `repeat(${MOBILE_NAV.length}, minmax(0, 1fr))` }}>
          {MOBILE_NAV.map(({ href, label, icon: Icon, badge }) => (
            <Link
              key={href}
              href={href}
              className="relative flex flex-col items-center gap-0.5 py-2.5 px-0.5 min-w-0 text-gray-500 hover:text-brand-blue"
            >
              <Icon className="w-5 h-5 shrink-0" />
              {badge ? (
                <span className="absolute top-1 right-[22%] inline-flex items-center justify-center min-w-[16px] h-[16px] px-1 rounded-full bg-brand-green text-brand-navy text-[10px] font-bold">
                  {badge}
                </span>
              ) : null}
              <span className="text-[10px] font-medium leading-none truncate max-w-full">{label}</span>
            </Link>
          ))}
        </div>
      </nav>
    </div>
  )
}
