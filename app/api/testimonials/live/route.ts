import { NextRequest, NextResponse } from "next/server"
import { createHash } from "crypto"
import { db } from "@/lib/db"
import { getCurrentUser } from "@/lib/session"

// Live reviews for the proposal editor's testimonial picker — straight from
// Google (the business's 5 most relevant, via the connected Place) or the
// public Trustpilot page for the org's website domain. Nothing is imported or
// stored: ticking one serialises it into the proposal section itself.
export async function GET(request: NextRequest) {
  const user = await getCurrentUser()
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  const source = request.nextUrl.searchParams.get("source")
  const org = await db.organization.findUnique({
    where: { id: user.organizationId },
    select: { googlePlaceId: true, website: true },
  })
  if (!org) return NextResponse.json({ error: "Not found" }, { status: 404 })

  // Stable ids from the content so re-fetching keeps selections toggling.
  const idFor = (prefix: string, author: string, text: string) =>
    `${prefix}-${createHash("sha256").update(`${author}|${text}`).digest("hex").slice(0, 10)}`

  try {
    if (source === "google") {
      if (!org.googlePlaceId) {
        return NextResponse.json(
          { error: "Connect your Google Business profile in Settings → Reviews & testimonials first." },
          { status: 409 }
        )
      }
      const { fetchPlaceReviews } = await import("@/lib/google-places")
      const { reviews } = await fetchPlaceReviews(org.googlePlaceId)
      return NextResponse.json({
        items: reviews.map((r) => ({
          id: idFor("glive", r.author, r.text),
          kind: "written",
          title: null,
          text: r.text,
          author: r.author,
          rating: r.rating,
          fileUrl: null,
          youtubeUrl: null,
        })),
        note: "Google shares a business's 5 most relevant reviews — the full list needs Google's approval-gated Business Profile API.",
      })
    }

    if (source === "trustpilot") {
      if (!org.website?.trim()) {
        return NextResponse.json(
          { error: "Set your website in Settings first — Trustpilot reviews are found via your domain." },
          { status: 409 }
        )
      }
      const { fetchTrustpilotReviews } = await import("@/lib/trustpilot")
      const result = await fetchTrustpilotReviews(org.website)
      if (!result) {
        return NextResponse.json(
          { error: "No Trustpilot review page found for your website's domain." },
          { status: 404 }
        )
      }
      return NextResponse.json({
        items: result.reviews.map((r) => ({
          id: idFor("tplive", r.author, r.text),
          kind: "written",
          title: r.title,
          text: r.text,
          author: r.author,
          rating: r.rating,
          fileUrl: null,
          youtubeUrl: null,
        })),
      })
    }

    return NextResponse.json({ error: "Unknown source" }, { status: 400 })
  } catch (err) {
    console.error("Live reviews fetch failed:", err)
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Couldn't fetch live reviews" },
      { status: 502 }
    )
  }
}
