import { NextRequest, NextResponse } from "next/server"
import { z } from "zod"
import { db } from "@/lib/db"
import { getCurrentUser } from "@/lib/session"

const updateOrgSchema = z.object({
  name: z.string().min(1).optional(),
  website: z.string().url().optional().or(z.literal("")),
  logoUrl: z.string().optional(),
  brandColor: z.string().regex(/^#[0-9A-Fa-f]{6}$/).optional(),
  secondaryColor: z.string().regex(/^#[0-9A-Fa-f]{6}$/).optional(),
  accentColor: z.string().regex(/^#[0-9A-Fa-f]{6}$/).optional(),
  email: z.string().email().optional().or(z.literal("")),
  phone: z.string().optional(),
  mainServices: z.array(z.string()).optional(),
  areasCovered: z.array(z.string()).optional(),
  yearEstablished: z.number().int().min(1800).max(2100).optional().nullable(),
  mainUSP: z.string().optional(),
  reviewCount: z.number().int().min(0).optional().nullable(),
  whyChooseUs: z.string().optional(),
  proposalTone: z.enum(["FRIENDLY", "PROFESSIONAL", "PREMIUM", "TECHNICAL"]).optional(),
  aboutUsSection: z.string().optional(),
  whyChooseUsSection: z.string().optional(),
  ourExperienceSection: z.string().optional(),
  ourApproachSection: z.string().optional(),
  termsAndConditions: z.string().optional(),
  youtubeChannelUrl: z.string().optional(),
  depositRules: z.string().max(500).optional(),
})

export async function GET() {
  const user = await getCurrentUser()
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }

  const org = await db.organization.findUnique({
    where: { id: user.organizationId },
  })

  return NextResponse.json(org)
}

export async function PATCH(request: NextRequest) {
  const user = await getCurrentUser()
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }

  try {
    const body = await request.json()
    const parsed = updateOrgSchema.safeParse(body)

    if (!parsed.success) {
      return NextResponse.json(
        { error: parsed.error.errors[0].message },
        { status: 400 }
      )
    }

    const { mainServices, areasCovered, ...rest } = parsed.data

    const org = await db.organization.update({
      where: { id: user.organizationId },
      data: {
        ...rest,
        ...(mainServices !== undefined && { mainServices: JSON.stringify(mainServices) }),
        ...(areasCovered !== undefined && { areasCovered: JSON.stringify(areasCovered) }),
      },
    })

    return NextResponse.json(org)
  } catch (error) {
    console.error("Organization update error:", error)
    return NextResponse.json(
      { error: "Failed to update organization" },
      { status: 500 }
    )
  }
}
