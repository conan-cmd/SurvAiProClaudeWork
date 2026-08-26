import { NextRequest, NextResponse } from "next/server"
import { z } from "zod"
import { db } from "@/lib/db"
import { getCurrentUser } from "@/lib/session"

const createSurveySchema = z.object({
  clientName: z.string().min(1, "Client name is required"),
  clientCompany: z.string().optional(),
  clientEmail: z.string().email().optional().or(z.literal("")),
  clientPhone: z.string().optional(),
  clientAddress: z.string().min(1, "Site address is required"),
  title: z.string().min(1, "Proposal title is required"),
  serviceType: z.string().min(1, "Service type is required"),
  isResidential: z.boolean(),
  clientPriorities: z.string().optional(),
  accessNotes: z.string().optional(),
  measurements: z.string().optional(),
  exclusions: z.string().optional(),
  writtenDescription: z.string().optional(),
  surveyedInPerson: z.boolean().optional(),
  // Booking: ISO datetime (client converts its local picker value) + surveyor.
  scheduledAt: z.string().optional(),
  assignedToId: z.string().optional(),
})

export async function GET() {
  const user = await getCurrentUser()
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  const surveys = await db.siteSurvey.findMany({
    where: { organizationId: user.organizationId },
    orderBy: { updatedAt: "desc" },
    include: {
      photos: { orderBy: { order: "asc" }, take: 1 },
      proposal: { select: { id: true, status: true } },
    },
  })

  return NextResponse.json(surveys)
}

export async function POST(request: NextRequest) {
  const user = await getCurrentUser()
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  try {
    const body = await request.json()
    const parsed = createSurveySchema.safeParse(body)

    if (!parsed.success) {
      return NextResponse.json({ error: parsed.error.errors[0].message }, { status: 400 })
    }

    const { scheduledAt, assignedToId, ...rest } = parsed.data
    const scheduled = scheduledAt ? new Date(scheduledAt) : null
    // The assignee must be a member of the caller's organization.
    const assignee = assignedToId
      ? await db.user.findFirst({ where: { id: assignedToId, organizationId: user.organizationId }, select: { id: true } })
      : null

    const survey = await db.siteSurvey.create({
      data: {
        ...rest,
        organizationId: user.organizationId,
        createdById: user.id,
        scheduledAt: scheduled && !isNaN(scheduled.getTime()) ? scheduled : null,
        assignedToId: assignee?.id ?? null,
      },
    })

    // Geocode the address and attach street-view + aerial hero shots.
    // Best-effort: survey creation never fails because of imagery.
    try {
      const { geocodeAddress, attachSiteImagery, what3wordsFor } = await import("@/lib/geo")
      const coords = await geocodeAddress(survey.clientAddress)
      if (coords) {
        const words = await what3wordsFor(coords.lat, coords.lng)
        await db.siteSurvey.update({
          where: { id: survey.id },
          data: { latitude: coords.lat, longitude: coords.lng, what3words: words },
        })
        await attachSiteImagery({
          surveyId: survey.id,
          organizationId: user.organizationId,
          address: survey.clientAddress,
          lat: coords.lat,
          lng: coords.lng,
        })
      }
    } catch (err) {
      console.error("Site imagery skipped:", err)
    }

    return NextResponse.json(survey, { status: 201 })
  } catch (error) {
    console.error("Survey creation error:", error)
    return NextResponse.json({ error: "Failed to create survey" }, { status: 500 })
  }
}
