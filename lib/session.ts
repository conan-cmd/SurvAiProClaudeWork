import "server-only"
import { getServerSession } from "next-auth"
import { authOptions } from "./auth"
import { db } from "./db"

export async function getSession() {
  return getServerSession(authOptions)
}

export async function getCurrentUser() {
  const session = await getSession()
  if (!session?.user?.email) return null

  const user = await db.user.findUnique({
    where: { email: session.user.email },
    include: { organization: true },
  })

  // Lightweight "last active" tracking for the admin usage view — throttled to at
  // most one write per user per 5 minutes so it never adds cost to normal requests.
  if (user && (!user.lastActiveAt || Date.now() - user.lastActiveAt.getTime() > 5 * 60 * 1000)) {
    const now = new Date()
    await db.user.update({ where: { id: user.id }, data: { lastActiveAt: now } }).catch(() => {})
    user.lastActiveAt = now
  }

  return user
}
