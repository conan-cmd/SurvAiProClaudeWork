export type ChannelVideo = {
  videoId: string
  title: string
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
    const m =
      html.match(/"channelId":"(UC[\w-]{22})"/) ||
      html.match(/channel_id=(UC[\w-]{22})/)
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
    // Skip entries whose "title" is just a URL (channel redirects, not real videos)
    if (!videoId || !title || /^https?:\/\//i.test(title)) continue
    videos.push({
      videoId,
      title,
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
  max = 4
): ChannelVideo[] {
  const stop = new Set(["the", "and", "for", "with", "clean", "cleaning"])
  const terms = jobText
    .toLowerCase()
    .split(/[^a-z]+/)
    .filter((t) => t.length > 3 && !stop.has(t))

  const scored = videos
    .map((v) => {
      const title = v.title.toLowerCase()
      const score = terms.reduce((s, t) => s + (title.includes(t) ? 1 : 0), 0)
      return { v, score }
    })
    .filter((x) => x.score > 0)
    .sort((a, b) => b.score - a.score)

  return scored.slice(0, max).map((x) => x.v)
}
