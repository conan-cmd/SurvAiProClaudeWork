import { NextRequest, NextResponse } from "next/server"
import { db } from "@/lib/db"
import { getCurrentUser } from "@/lib/session"
import { isPlatformAdmin } from "@/lib/admin"

// Platform-admin account drill-down for the usage dashboard: contact info,
// team, pipeline health and connected integrations for one organisation.
export async function GET(_req: NextRequest, { params }: { params: { orgId: string } }) {
  const user = await getCurrentUser()
  if (!isPlatformAdmin(user)) return NextResponse.json({ error: "Forbidden" }, { status: 403 })

  const org = await db.organization.findUnique({
    where: { id: params.orgId },
    select: {
      id: true, name: true, email: true, phone: true, website: true, createdAt: true,
      logoUrl: true, mainServices: true, subscriptionStatus: true, billingExempt: true,
      freeAccess: true, isFoundingMember: true, referredByCode: true,
      stripeAccountId: true, stripeChargesEnabled: true,
      pipedriveCompanyId: true, xeroTenantId: true, xeroTenantName: true,
      bigchangeApiKey: true, googlePlaceId: true,
      users: {
        select: {
          name: true, email: true, role: true, lastLoginAt: true, lastActiveAt: true,
          gmailAddress: true, createdAt: true,
        },
        orderBy: { createdAt: "asc" },
      },
      _count: { select: { surveys: true, proposals: true, rams: true, jobReports: true, testimonials: true } },
    },
  })
  if (!org) return NextResponse.json({ error: "Not found" }, { status: 404 })

  const proposals = await db.proposal.findMany({
    where: { organizationId: org.id },
    select: {
      status: true, createdAt: true, sentAt: true, signedAt: true, wonAt: true,
      depositPaidAt: true, depositAmount: true, agreedTotal: true,
    },
  })

  const byStatus: Record<string, number> = {}
  for (const p of proposals) byStatus[p.status] = (byStatus[p.status] || 0) + 1
  const wonish = proposals.filter((p) => ["SIGNED", "DEPOSIT_PAID", "WON"].includes(p.status))
  const decided = wonish.length + (byStatus.LOST || 0)
  const depositsPaid = proposals.filter((p) => p.depositPaidAt)
  const latest = (ds: (Date | null)[]) => {
    const t = ds.filter((d): d is Date => !!d).map((d) => d.getTime())
    return t.length ? new Date(Math.max(...t)) : null
  }

  return NextResponse.json({
    name: org.name,
    contact: { email: org.email, phone: org.phone, website: org.website },
    createdAt: org.createdAt,
    hasBranding: Boolean(org.logoUrl),
    hasServices: Boolean(org.mainServices?.trim()),
    team: org.users.map((u) => ({
      name: u.name, email: u.email, role: u.role,
      lastActiveAt: u.lastActiveAt ?? u.lastLoginAt,
      gmailConnected: Boolean(u.gmailAddress),
      joinedAt: u.createdAt,
    })),
    counts: org._count,
    pipeline: {
      byStatus,
      won: wonish.length,
      winRate: decided ? Math.round((wonish.length / decided) * 100) : null,
      wonValue: wonish.reduce((s, p) => s + (p.agreedTotal || 0), 0),
      depositsPaid: depositsPaid.length,
      depositsValue: depositsPaid.reduce((s, p) => s + (p.depositAmount || 0), 0),
      lastProposalAt: latest(proposals.map((p) => p.createdAt)),
      lastSentAt: latest(proposals.map((p) => p.sentAt)),
    },
    integrations: {
      stripePayments: Boolean(org.stripeAccountId && org.stripeChargesEnabled),
      pipedrive: Boolean(org.pipedriveCompanyId),
      xero: Boolean(org.xeroTenantId),
      xeroTenantName: org.xeroTenantName,
      bigchange: Boolean(org.bigchangeApiKey),
      googleReviews: Boolean(org.googlePlaceId),
    },
  })
}
