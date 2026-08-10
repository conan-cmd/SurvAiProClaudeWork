import { type NextAuthOptions } from "next-auth"
import CredentialsProvider from "next-auth/providers/credentials"
import GoogleProvider from "next-auth/providers/google"
import AppleProvider from "next-auth/providers/apple"
import { db } from "./db"
import { compare } from "bcryptjs"

const providers: NextAuthOptions["providers"] = [
  CredentialsProvider({
    name: "Credentials",
    credentials: {
      email: { label: "Email", type: "email" },
      password: { label: "Password", type: "password" },
    },
    async authorize(credentials) {
      if (!credentials?.email || !credentials?.password) {
        throw new Error("Invalid credentials")
      }
      const user = await db.user.findUnique({
        where: { email: credentials.email },
      })
      if (!user || !user.password) throw new Error("User not found")

      const valid = await compare(credentials.password, user.password)
      if (!valid) throw new Error("Invalid password")

      return {
        id: user.id,
        email: user.email,
        name: user.name,
        image: user.image,
        organizationId: user.organizationId,
        role: user.role,
      }
    },
  }),
]

// Social providers activate automatically once their env vars are set
if (process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_SECRET) {
  providers.push(
    GoogleProvider({
      clientId: process.env.GOOGLE_CLIENT_ID,
      clientSecret: process.env.GOOGLE_CLIENT_SECRET,
    })
  )
}
if (process.env.APPLE_CLIENT_ID && process.env.APPLE_CLIENT_SECRET) {
  providers.push(
    AppleProvider({
      clientId: process.env.APPLE_CLIENT_ID,
      clientSecret: process.env.APPLE_CLIENT_SECRET,
    })
  )
}

export const authOptions: NextAuthOptions = {
  providers,
  session: {
    strategy: "jwt",
    maxAge: 30 * 24 * 60 * 60, // 30 days
  },
  callbacks: {
    // First social sign-in creates the user + their organization
    async signIn({ user, account }) {
      if (account?.provider === "credentials") return true
      if (!user.email) return false

      const existing = await db.user.findUnique({ where: { email: user.email } })
      if (!existing) {
        await db.organization.create({
          data: {
            name: user.name ? `${user.name}'s Company` : "My Company",
            users: {
              create: {
                email: user.email,
                name: user.name || null,
                image: user.image || null,
                role: "OWNER",
              },
            },
          },
        })
      }
      return true
    },
    async jwt({ token, user }) {
      if (user) {
        token.id = user.id
        token.organizationId = (user as { organizationId?: string }).organizationId
        token.role = (user as { role?: string }).role
        // Record the login timestamp (best-effort; email is unique). `user` is only
        // present on the initial sign-in, so this fires once per login, not on refresh.
        if (user.email) {
          await db.user.update({ where: { email: user.email }, data: { lastLoginAt: new Date() } }).catch(() => {})
        }
      }
      // Social logins (and older sessions) may lack org/role - resolve from the DB.
      if ((!token.organizationId || !token.role) && token.email) {
        const dbUser = await db.user.findUnique({ where: { email: token.email } })
        if (dbUser) {
          token.id = dbUser.id
          token.organizationId = dbUser.organizationId
          token.role = dbUser.role
        }
      }
      return token
    },
    async session({ session, token }) {
      if (session.user) {
        const u = session.user as Record<string, unknown>
        u.id = token.id
        u.organizationId = token.organizationId
      }
      return session
    },
  },
  pages: {
    signIn: "/auth/login",
    error: "/auth/error",
  },
  secret: process.env.NEXTAUTH_SECRET,
}
