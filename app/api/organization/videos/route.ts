import { NextRequest, NextResponse } from "next/server"
import { db } from "@/lib/db"
import { getCurrentUser } from "@/lib/session"
import { fetchChannelVideos, searchChannelVideos } from "@/lib/youtube"

// Lists videos from the org's YouTube channel via the public RSS feed
// (no API key required). Optional ?q= filters by title keywords.
export async function GET(request: NextRequest) {
  const user = await getCurrentUser()
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  const org = await db.organization.findUnique({ where: { id: user.organizationId } })
  if (!org?.youtubeChannelUrl) {
    return NextResponse.json(
      { error: "Add your YouTube channel URL in Settings first" },
      { status: 400 }
    )
  }

  try {
    const search = request.nextUrl.searchParams.get("q")?.trim()
    if (search) {
      const found = await searchChannelVideos(org.youtubeChannelUrl, search, 12)
      if (found.length) return NextResponse.json(found)
    }
    let videos = await fetchChannelVideos(org.youtubeChannelUrl)
    if (!videos.length) {
      return NextResponse.json(
        { error: "Couldn't find videos for that channel. Check the URL in Settings." },
        { status: 422 }
      )
    }

    const q = request.nextUrl.searchParams.get("q")?.toLowerCase().trim()
    if (q) {
      const terms = q.split(/\s+/)
      const matches = videos.filter((v) =>
        terms.some((t) => v.title.toLowerCase().includes(t))
      )
      if (matches.length) videos = matches
    }

    return NextResponse.json(videos)
  } catch (error) {
    console.error("YouTube feed error:", error)
    return NextResponse.json(
      { error: "Couldn't load videos from YouTube. Try again shortly." },
      { status: 502 }
    )
  }
}
