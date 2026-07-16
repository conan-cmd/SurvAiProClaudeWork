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

  return user
}
