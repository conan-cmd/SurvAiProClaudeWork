import Link from "next/link"
import { redirect } from "next/navigation"
import { getCurrentUser } from "@/lib/session"
import { hasActiveAccess } from "@/lib/billing"
import { FeedbackButton } from "@/components/feedback-button"
import { SignOutButton } from "@/components/sign-out-button"
import { LayoutDashboard, ClipboardList, FileText, Users, Images, Settings, ShieldAlert } from "lucide-react"

const NAV = [
  { href: "/dashboard", label: "Dashboard", icon: LayoutDashboard },
  { href: "/surveys", label: "Surveys", icon: ClipboardList },
  { href: "/proposals", label: "Proposals", icon: FileText },
  { href: "/rams", label: "RAMS", icon: ShieldAlert },
  { href: "/customers", label: "Customers", icon: Users },
  { href: "/gallery", label: "Gallery", icon: Images },
  { href: "/settings", label: "Settings", icon: Settings },
]

// Mobile bottom bar keeps the six most-used tabs (Gallery stays in the top nav).
const MOBILE_NAV = NAV.filter((n) => n.href !== "/gallery")

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const user = await getCurrentUser()
  if (!user) redirect("/auth/login")
  // No active subscription (and not exempt) → send to the paywall.
  if (!hasActiveAccess(user.organization)) redirect("/subscribe")

  return (
    <div className="min-h-screen bg-brand-gray">
      {/* Top bar (desktop) / header (mobile) */}
      <header className="bg-brand-navy text-white sticky top-0 z-40">
        <div className="max-w-6xl mx-auto flex items-center justify-between px-4 h-14">
          <Link href="/dashboard" className="font-bold text-lg tracking-tight">
            Surv<span className="text-brand-green">AI</span>Pro
          </Link>
          <nav className="hidden md:flex items-center gap-1">
            {NAV.map(({ href, label }) => (
              <Link
                key={href}
                href={href}
                className="px-3 py-1.5 rounded-md text-sm text-gray-200 hover:bg-white/10 hover:text-white transition"
              >
                {label}
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
      <nav className="md:hidden fixed bottom-0 inset-x-0 bg-white border-t z-40">
        <div className="grid grid-cols-6">
          {MOBILE_NAV.map(({ href, label, icon: Icon }) => (
            <Link
              key={href}
              href={href}
              className="flex flex-col items-center gap-0.5 py-2.5 text-gray-500 hover:text-brand-blue"
            >
              <Icon className="w-5 h-5" />
              <span className="text-[11px] font-medium">{label}</span>
            </Link>
          ))}
        </div>
      </nav>
    </div>
  )
}
