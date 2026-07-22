import { NextResponse } from "next/server"
import { db } from "@/lib/db"
import { getCurrentUser } from "@/lib/session"

// Removes the stored Gmail connection; sends fall back to Resend afterwards.
export async function POST() {
  const user = await getCurrentUser()
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  await db.user.update({
    where: { id: user.id },
    data: { gmailAddress: null, gmailRefreshToken: null },
  })
  return NextResponse.json({ success: true })
}
