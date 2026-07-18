export type ChannelVideo = {
  videoId: string
  title: string
  description?: string
  thumbnail: string
  url: string
}

export async function resolveChannelId(channelUrl: string): Promise<string | null> {
  const direct = channelUrl.match(/youtube\.com\/channel\/(UC[\w-]{22})/)
  if (direct) return direct[1]

  try {
    const res = await fetch(channelUrl, {
      headers: { "User-Agent": "Mozilla/5.0 (compatible; SurvAIPro/1.0)" },
      signal: AbortSignal.timeout(8000),
    })
    if (!res.ok) return null
    const html = await res.text()
    // Order matters: canonical/externalId identify THIS channel; a bare
    // "channelId" match can belong to a featured third-party channel.
    const m =
      html.match(/<link rel="canonical" href="https:\/\/www\.youtube\.com\/channel\/(UC[\w-]{22})"/) ||
      html.match(/"externalId":"(UC[\w-]{22})"/) ||
      html.match(/"channelId":"(UC[\w-]{22})"/)
    return m ? m[1] : null
  } catch {
    return null
  }
}

export async function fetchChannelVideos(channelUrl: string): Promise<ChannelVideo[]> {
  const channelId = await resolveChannelId(channelUrl)
  if (!channelId) return []

  const res = await fetch(
    `https://www.youtube.com/feeds/videos.xml?channel_id=${channelId}`,
    { signal: AbortSignal.timeout(8000) }
  )
  if (!res.ok) return []
  const xml = await res.text()

  const videos: ChannelVideo[] = []
  for (const entry of xml.split("<entry>").slice(1)) {
    const videoId = entry.match(/<yt:videoId>([^<]+)<\/yt:videoId>/)?.[1]
    const title = entry
      .match(/<title>([^<]*)<\/title>/)?.[1]
      ?.replace(/&amp;/g, "&").replace(/&quot;/g, '"').replace(/&#39;/g, "'")
    // Skip entries whose "title" is just a URL (channel redirects) and
    // hashtag-titled Shorts, which say nothing useful about the job
    if (!videoId || !title || /^https?:\/\//i.test(title)) continue
    if ((title.match(/#/g) || []).length >= 2 || title.trim().startsWith("#")) continue
    const description = entry
      .match(/<media:description>([\s\S]*?)<\/media:description>/)?.[1]
      ?.replace(/&amp;/g, "&").replace(/&quot;/g, '"').replace(/&#39;/g, "'")
      .slice(0, 500)
    videos.push({
      videoId,
      title,
      description,
      thumbnail: `https://i.ytimg.com/vi/${videoId}/hqdefault.jpg`,
      url: `https://www.youtube.com/watch?v=${videoId}`,
    })
  }
  return videos
}

/**
 * Picks videos relevant to a job by keyword overlap with the video title.
 * Returns [] when nothing genuinely matches - no forced filler.
 */
export function rankRelevantVideos(
  videos: ChannelVideo[],
  jobText: string,
  max = 2
): ChannelVideo[] {
  const stop = new Set(["the", "and", "for", "with", "clean", "cleaning"])
  const terms = jobText
    .toLowerCase()
    .split(/[^a-z]+/)
    .filter((t) => t.length > 3 && !stop.has(t))

  const scored = videos
    .map((v) => {
      // Match on title + description with hashtags stripped out - tags are
      // broad/generic and cause false matches. Title hits count double.
      const clean = (s: string) => s.toLowerCase().replace(/#\w+/g, " ")
      const title = clean(v.title)
      const desc = clean(v.description || "")
      const score = terms.reduce(
        (s, t) => s + (title.includes(t) ? 2 : 0) + (desc.includes(t) ? 1 : 0),
        0
      )
      return { v, score }
    })
    // Require a solid match (a title hit, or multiple description hits) -
    // a single stray description word is not "similar work"
    .filter((x) => x.score >= 2)
    .sort((a, b) => b.score - a.score)

  return scored.slice(0, max).map((x) => x.v)
}
