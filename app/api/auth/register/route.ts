import { NextRequest, NextResponse } from "next/server"
import { hash } from "bcryptjs"
import { z } from "zod"
import { db } from "@/lib/db"

const registerSchema = z.object({
  email: z.string().trim().email("Invalid email address"),
  password: z.string().min(8, "Password must be at least 8 characters"),
  companyName: z.string().trim().min(1, "Company name is required"),
  name: z.string().trim().optional(),
  referredByCode: z.string().trim().max(30).optional(),
})

export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const parsed = registerSchema.safeParse(body)

    if (!parsed.success) {
      return NextResponse.json(
        { error: parsed.error.errors[0].message },
        { status: 400 }
      )
    }

    const { email, password, companyName, name } = parsed.data

    const existingUser = await db.user.findUnique({ where: { email } })
    if (existingUser) {
      return NextResponse.json(
        { error: "An account with this email already exists" },
        { status: 409 }
      )
    }

    const hashedPassword = await hash(password, 12)

    // Only honour a referral code that matches a real org.
    let referredByCode: string | undefined
    if (parsed.data.referredByCode) {
      const referrer = await db.organization.findUnique({
        where: { referralCode: parsed.data.referredByCode },
        select: { id: true },
      })
      if (referrer) referredByCode = parsed.data.referredByCode
    }

    // Create organization and owner user together
    const organization = await db.organization.create({
      data: {
        name: companyName,
        ...(referredByCode ? { referredByCode } : {}),
        users: {
          create: {
            email,
            password: hashedPassword,
            name: name || null,
            role: "OWNER",
          },
        },
      },
    })

    return NextResponse.json({ success: true, organizationId: organization.id })
  } catch (error) {
    console.error("Registration error:", error)
    return NextResponse.json(
      { error: "Something went wrong. Please try again." },
      { status: 500 }
    )
  }
}
