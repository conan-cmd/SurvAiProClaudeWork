import { NextResponse } from "next/server"
import { randomBytes } from "crypto"
import { db } from "@/lib/db"
import { getCurrentUser } from "@/lib/session"

// Returns this org's referral code (generating one on first use) and how many
// businesses have signed up with it.
export async function GET() {
  const user = await getCurrentUser()
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  let code = user.organization.referralCode
  if (!code) {
    for (let i = 0; i < 6 && !code; i++) {
      const candidate = randomBytes(6)
        .toString("base64url")
        .replace(/[^a-zA-Z0-9]/g, "")
        .slice(0, 8)
      if (candidate.length < 6) continue
      try {
        await db.organization.update({
          where: { id: user.organizationId },
          data: { referralCode: candidate },
        })
        code = candidate
      } catch {
        // unique collision — try another
      }
    }
  }

  const count = code
    ? await db.organization.count({ where: { referredByCode: code } })
    : 0
  return NextResponse.json({ code, count })
}
