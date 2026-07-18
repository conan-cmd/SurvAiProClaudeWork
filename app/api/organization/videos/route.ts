import { NextRequest, NextResponse } from "next/server"
import { db } from "@/lib/db"
import { getCurrentUser } from "@/lib/session"

// Lists videos from the org's YouTube channel via the public RSS feed
// (no API key required). Optional ?q= filters by title keywords.

async function resolveChannelId(channelUrl: string): Promise<string | null> {
  const direct = channelUrl.match(/youtube\.com\/channel\/(UC[\w-]{22})/)
  if (direct) return direct[1]

  // Handle @handles, /c/ and /user/ URLs by reading the channel page
  try {
    const res = await fetch(channelUrl, {
      headers: { "User-Agent": "Mozilla/5.0 (compatible; SurvAIPro/1.0)" },
      signal: AbortSignal.timeout(8000),
    })
    if (!res.ok) return null
    const html = await res.text()
    const m =
      html.match(/"channelId":"(UC[\w-]{22})"/) ||
      html.match(/channel_id=(UC[\w-]{22})/)
    return m ? m[1] : null
  } catch {
    return null
  }
}

type Video = { videoId: string; title: string; thumbnail: string; url: string }

function parseFeed(xml: string): Video[] {
  const videos: Video[] = []
  const entries = xml.split("<entry>").slice(1)
  for (const entry of entries) {
    const videoId = entry.match(/<yt:videoId>([^<]+)<\/yt:videoId>/)?.[1]
    const title = entry.match(/<title>([^<]*)<\/title>/)?.[1]
    if (!videoId || !title) continue
    videos.push({
      videoId,
      title: title.replace(/&amp;/g, "&").replace(/&quot;/g, '"').replace(/&#39;/g, "'"),
      thumbnail: `https://i.ytimg.com/vi/${videoId}/hqdefault.jpg`,
      url: `https://www.youtube.com/watch?v=${videoId}`,
    })
  }
  return videos
}

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

  const channelId = await resolveChannelId(org.youtubeChannelUrl)
  if (!channelId) {
    return NextResponse.json(
      { error: "Couldn't find that YouTube channel. Check the URL in Settings." },
      { status: 422 }
    )
  }

  try {
    const res = await fetch(
      `https://www.youtube.com/feeds/videos.xml?channel_id=${channelId}`,
      { signal: AbortSignal.timeout(8000) }
    )
    if (!res.ok) throw new Error(`Feed returned ${res.status}`)
    let videos = parseFeed(await res.text())

    const q = request.nextUrl.searchParams.get("q")?.toLowerCase().trim()
    if (q) {
      const terms = q.split(/\s+/)
      const matches = videos.filter((v) =>
        terms.some((t) => v.title.toLowerCase().includes(t))
      )
      // Fall back to the full list if the filter wipes everything out
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
