import { NextRequest, NextResponse } from "next/server"
import { z } from "zod"
import { db } from "@/lib/db"
import { getCurrentUser } from "@/lib/session"
import { getTemplate } from "@/lib/templates"
import { generateProposalSections, friendlyAIError } from "@/lib/ai"
import { fetchChannelVideos, rankRelevantVideos } from "@/lib/youtube"

const createProposalSchema = z.object({
  surveyId: z.string().min(1),
  templateId: z.enum(["QUICK_QUOTE", "CONSULTATIVE", "AUTHORITY"]),
})

export async function GET() {
  const user = await getCurrentUser()
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  const proposals = await db.proposal.findMany({
    where: { organizationId: user.organizationId },
    orderBy: { updatedAt: "desc" },
    include: {
      pricingLineItems: true,
      survey: { select: { title: true, clientAddress: true, createdAt: true } },
    },
  })

  return NextResponse.json(proposals)
}

export async function POST(request: NextRequest) {
  const user = await getCurrentUser()
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  const body = await request.json()
  const parsed = createProposalSchema.safeParse(body)
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.errors[0].message }, { status: 400 })
  }

  const { surveyId, templateId } = parsed.data
  const template = getTemplate(templateId)
  if (!template) {
    return NextResponse.json({ error: "Unknown template" }, { status: 400 })
  }

  const survey = await db.siteSurvey.findFirst({
    where: { id: surveyId, organizationId: user.organizationId },
    include: {
      photos: { where: { includeInProposal: true, internalOnly: false }, orderBy: { order: "asc" } },
      transcripts: { where: { approved: true } },
      proposal: true,
    },
  })
  if (!survey) return NextResponse.json({ error: "Survey not found" }, { status: 404 })
  if (survey.proposal) {
    return NextResponse.json(
      { error: "This survey already has a proposal", proposalId: survey.proposal.id },
      { status: 409 }
    )
  }

  const org = await db.organization.findUniqueOrThrow({
    where: { id: user.organizationId },
  })

  try {
    const generated = await generateProposalSections({
      template,
      tone: org.proposalTone,
      company: {
        name: org.name,
        services: org.mainServices ? JSON.parse(org.mainServices) : [],
        areas: org.areasCovered ? JSON.parse(org.areasCovered) : [],
        yearEstablished: org.yearEstablished,
        mainUSP: org.mainUSP,
        reviewCount: org.reviewCount,
        whyChooseUs: org.whyChooseUs,
      },
      client: {
        name: survey.clientName,
        company: survey.clientCompany,
        address: survey.clientAddress,
      },
      survey: {
        title: survey.title,
        serviceType: survey.serviceType,
        isResidential: survey.isResidential,
        writtenDescription: survey.writtenDescription,
        clientPriorities: survey.clientPriorities,
        accessNotes: survey.accessNotes,
        measurements: survey.measurements,
        exclusions: survey.exclusions,
      },
      approvedTranscripts: survey.transcripts.map((t) => t.text),
      photoCaptions: survey.photos.filter((p) => p.caption).map((p) => p.caption as string),
    })

    const generatedByType = new Map(generated.map((g) => [g.type, g.content]))

    // Build full section list in template order, mixing AI + profile + structured sections
    const sectionsData = template.sections.map((def, index) => {
      let content = ""
      if (def.aiGenerated) {
        content = generatedByType.get(def.type) || ""
      } else if (def.type === "about_us") {
        content = org.aboutUsSection || "MISSING: Add your About Us section in Settings."
      } else if (def.type === "why_choose_us") {
        content = org.whyChooseUsSection || "MISSING: Add your Why Choose Us section in Settings."
      } else if (def.type === "cover") {
        content = JSON.stringify({
          title: survey.title,
          clientName: survey.clientName,
          clientCompany: survey.clientCompany,
          siteAddress: survey.clientAddress,
        })
      } else if (def.type === "terms") {
        content =
          org.termsAndConditions ||
          "MISSING: Add your standard Terms and Conditions in Settings so they appear on every proposal automatically."
      }

      return {
        type: def.type,
        title: def.title,
        content,
        order: index,
        photoIds:
          def.type === "photos" ? JSON.stringify(survey.photos.map((p) => p.id)) : null,
      }
    })

    // Auto-suggest similar-project videos from the org's YouTube channel.
    // Only added when titles genuinely match the job; the user can remove
    // or re-pick videos in the editor. Failure here never blocks generation.
    if (org.youtubeChannelUrl) {
      try {
        const videos = await fetchChannelVideos(org.youtubeChannelUrl)
        const relevant = rankRelevantVideos(
          videos,
          `${survey.serviceType} ${survey.title} ${survey.writtenDescription || ""}`
        )
        if (relevant.length) {
          const pricingIndex = sectionsData.findIndex((s) => s.type === "pricing")
          const insertAt = pricingIndex === -1 ? sectionsData.length : pricingIndex
          sectionsData.splice(insertAt, 0, {
            type: "videos",
            title: "Similar Projects In Action",
            content: JSON.stringify(relevant),
            order: 0,
            photoIds: null,
          })
          sectionsData.forEach((s, i) => (s.order = i))
        }
      } catch (err) {
        console.error("Video suggestion skipped:", err)
      }
    }

    const proposal = await db.proposal.create({
      data: {
        organizationId: user.organizationId,
        surveyId: survey.id,
        clientName: survey.clientName,
        clientEmail: survey.clientEmail,
        templateName: template.id,
        sections: { create: sectionsData },
      },
      include: { sections: { orderBy: { order: "asc" } } },
    })

    return NextResponse.json(proposal, { status: 201 })
  } catch (error) {
    console.error("Proposal generation error:", error)
    return NextResponse.json(
      { error: friendlyAIError(error, "AI generation failed. Please try again.") },
      { status: 500 }
    )
  }
}
