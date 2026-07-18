import { NextResponse } from "next/server"
import { db } from "@/lib/db"
import { getCurrentUser } from "@/lib/session"
import OpenAI from "openai"

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY })

// Generates the four reusable company sections from the org profile.
// Output is a DRAFT: the user must review and edit before use.
export async function POST() {
  const user = await getCurrentUser()
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }

  const org = await db.organization.findUnique({
    where: { id: user.organizationId },
  })

  if (!org) {
    return NextResponse.json({ error: "Organization not found" }, { status: 404 })
  }

  const services = org.mainServices ? JSON.parse(org.mainServices).join(", ") : "not provided"
  const areas = org.areasCovered ? JSON.parse(org.areasCovered).join(", ") : "not provided"

  const prompt = `Write four reusable proposal sections for this company. Use ONLY the facts below. Do not invent awards, certifications, statistics, or client names. If a fact is missing, write around it rather than making one up.

Company: ${org.name}
Website: ${org.website || "not provided"}
Services: ${services}
Areas covered: ${areas}
Year established: ${org.yearEstablished || "not provided"}
Main USP: ${org.mainUSP || "not provided"}
Number of 5-star reviews: ${org.reviewCount ?? "not provided"}
Why clients choose them: ${org.whyChooseUs || "not provided"}
Tone: ${org.proposalTone.toLowerCase()}

Return JSON with exactly these keys: "aboutUs", "whyChooseUs", "ourExperience", "ourApproach". Each value is 80-150 words of plain prose (no headings).`

  try {
    const response = await openai.chat.completions.create({
      model: "gpt-4o",
      messages: [
        {
          role: "system",
          content:
            "You write company profile sections for service business proposals. You never invent facts. You respond with valid JSON only.",
        },
        { role: "user", content: prompt },
      ],
      response_format: { type: "json_object" },
      temperature: 0.6,
    })

    const sections = JSON.parse(response.choices[0].message.content || "{}")

    const updated = await db.organization.update({
      where: { id: org.id },
      data: {
        aboutUsSection: sections.aboutUs || null,
        whyChooseUsSection: sections.whyChooseUs || null,
        ourExperienceSection: sections.ourExperience || null,
        ourApproachSection: sections.ourApproach || null,
      },
    })

    return NextResponse.json({
      aboutUsSection: updated.aboutUsSection,
      whyChooseUsSection: updated.whyChooseUsSection,
      ourExperienceSection: updated.ourExperienceSection,
      ourApproachSection: updated.ourApproachSection,
    })
  } catch (error) {
    console.error("Section generation error:", error)
    const { friendlyAIError } = await import("@/lib/ai")
    return NextResponse.json(
      { error: friendlyAIError(error, "Failed to generate sections. Please try again.") },
      { status: 500 }
    )
  }
}
