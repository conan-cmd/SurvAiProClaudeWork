import "server-only"

// Live Trustpilot reviews from the business's PUBLIC review page
// (trustpilot.com/review/<domain>) — no import, no API key, no labelling.
// Parsed from the page's JSON-LD (stable, schema.org Review items) with the
// Next.js __NEXT_DATA__ payload as a fallback.

export type TrustpilotReview = {
  author: string
  rating: number
  title: string | null
  text: string
}

export async function fetchTrustpilotReviews(
  websiteUrl: string
): Promise<{ url: string; reviews: TrustpilotReview[] } | null> {
  let domain: string
  try {
    domain = new URL(/^https?:\/\//i.test(websiteUrl) ? websiteUrl : `https://${websiteUrl}`).hostname
      .toLowerCase()
      .replace(/^www\./, "")
  } catch {
    return null
  }

  for (const host of ["uk.trustpilot.com", "www.trustpilot.com"]) {
    const pageUrl = `https://${host}/review/${domain}`
    try {
      const res = await fetch(pageUrl, {
        headers: {
          "User-Agent":
            "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/129.0.0.0 Safari/537.36",
          Accept: "text/html,application/xhtml+xml",
          "Accept-Language": "en-GB,en;q=0.9",
        },
        redirect: "follow",
        signal: AbortSignal.timeout(10000),
      })
      if (!res.ok) continue
      const html = (await res.text()).slice(0, 3_000_000)
      const reviews = parseJsonLd(html) ?? parseNextData(html) ?? []
      if (reviews.length) return { url: pageUrl, reviews }
    } catch {
      continue
    }
  }
  return null
}

function parseJsonLd(html: string): TrustpilotReview[] | null {
  const out: TrustpilotReview[] = []
  const re = /<script[^>]+application\/ld\+json[^>]*>([\s\S]*?)<\/script>/gi
  let m: RegExpExecArray | null
  while ((m = re.exec(html)) !== null) {
    try {
      const data = JSON.parse(m[1]) as unknown
      const nodes: unknown[] = Array.isArray(data)
        ? data
        : data && typeof data === "object" && Array.isArray((data as Record<string, unknown>)["@graph"])
          ? ((data as Record<string, unknown>)["@graph"] as unknown[])
          : [data]
      for (const n of nodes) {
        const r = n as Record<string, unknown>
        if (!r || r["@type"] !== "Review") continue
        const text = typeof r.reviewBody === "string" ? r.reviewBody.trim() : ""
        if (!text) continue
        const author = (r.author as Record<string, unknown> | undefined)?.name
        const rating = Number((r.reviewRating as Record<string, unknown> | undefined)?.ratingValue)
        out.push({
          author: typeof author === "string" && author ? author : "Trustpilot reviewer",
          rating: Number.isFinite(rating) && rating >= 1 && rating <= 5 ? Math.round(rating) : 5,
          title: typeof r.headline === "string" && r.headline.trim() ? r.headline.trim() : null,
          text,
        })
      }
    } catch {
      continue
    }
  }
  return out.length ? out : null
}

// Fallback: dig the reviews array out of Next.js's embedded page state.
function parseNextData(html: string): TrustpilotReview[] | null {
  const m = html.match(/<script id="__NEXT_DATA__"[^>]*>([\s\S]*?)<\/script>/i)
  if (!m) return null
  try {
    const arr = findReviewArray(JSON.parse(m[1]))
    if (!arr) return null
    const out = arr
      .map((r) => {
        const text = typeof r.text === "string" ? r.text.trim() : ""
        const rating = Number(r.rating)
        const consumer = r.consumer as Record<string, unknown> | undefined
        return {
          author:
            typeof consumer?.displayName === "string" && consumer.displayName
              ? consumer.displayName
              : "Trustpilot reviewer",
          rating: Number.isFinite(rating) && rating >= 1 && rating <= 5 ? Math.round(rating) : 5,
          title: typeof r.title === "string" && r.title.trim() ? r.title.trim() : null,
          text,
        }
      })
      .filter((r) => r.text)
    return out.length ? out : null
  } catch {
    return null
  }
}

function findReviewArray(node: unknown, depth = 0): Record<string, unknown>[] | null {
  if (depth > 10 || !node || typeof node !== "object") return null
  if (Array.isArray(node)) {
    if (
      node.length &&
      node.every((x) => x && typeof x === "object" && "text" in x && "rating" in x)
    ) {
      return node as Record<string, unknown>[]
    }
    for (const item of node) {
      const found = findReviewArray(item, depth + 1)
      if (found) return found
    }
    return null
  }
  for (const v of Object.values(node)) {
    const found = findReviewArray(v, depth + 1)
    if (found) return found
  }
  return null
}
