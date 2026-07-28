import { NextResponse } from "next/server"
import { db } from "@/lib/db"
import { getCurrentUser } from "@/lib/session"

export async function GET() {
  const user = await getCurrentUser()
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  const org = await db.organization.findUnique({
    where: { id: user.organizationId },
    select: {
      billingExempt: true,
      subscriptionStatus: true,
      subscriptionPlan: true,
      currentPeriodEnd: true,
      stripeCustomerId: true,
    },
  })
  if (!org) return NextResponse.json({ error: "Not found" }, { status: 404 })

  return NextResponse.json({
    exempt: org.billingExempt,
    status: org.subscriptionStatus,
    plan: org.subscriptionPlan,
    currentPeriodEnd: org.currentPeriodEnd,
    hasCustomer: Boolean(org.stripeCustomerId),
  })
}
