import "server-only"

// Google Places lookups for the reviews import. Uses the same GOOGLE_MAPS_API_KEY
// as geocoding. Note: the Places Details API returns the business's 5 most
// relevant reviews — the full list would need the (approval-gated) Business
// Profile API, so this is the pragmatic v1.

const KEY = () => process.env.GOOGLE_MAPS_API_KEY

export type PlaceHit = {
  placeId: string
  name: string
  address: string
  rating: number | null
  totalReviews: number | null
}

export type PlaceReview = {
  author: string
  rating: number
  text: string
  when: string // e.g. "2 months ago"
}

export async function searchBusiness(query: string): Promise<PlaceHit[]> {
  const key = KEY()
  if (!key) return []
  const url = `https://maps.googleapis.com/maps/api/place/textsearch/json?query=${encodeURIComponent(query)}&key=${key}`
  const res = await fetch(url)
  if (!res.ok) return []
  const data = await res.json()
  if (!Array.isArray(data.results)) return []
  return data.results.slice(0, 5).map((r: Record<string, unknown>) => ({
    placeId: String(r.place_id || ""),
    name: String(r.name || ""),
    address: String(r.formatted_address || ""),
    rating: typeof r.rating === "number" ? r.rating : null,
    totalReviews: typeof r.user_ratings_total === "number" ? r.user_ratings_total : null,
  }))
}

export async function fetchPlaceReviews(placeId: string): Promise<{ name: string; reviews: PlaceReview[] }> {
  const key = KEY()
  if (!key) return { name: "", reviews: [] }
  const url = `https://maps.googleapis.com/maps/api/place/details/json?place_id=${encodeURIComponent(placeId)}&fields=name,reviews&reviews_no_translations=true&key=${key}`
  const res = await fetch(url)
  if (!res.ok) return { name: "", reviews: [] }
  const data = await res.json()
  const result = data.result || {}
  const reviews = Array.isArray(result.reviews) ? result.reviews : []
  return {
    name: String(result.name || ""),
    reviews: reviews
      .filter((r: Record<string, unknown>) => typeof r.text === "string" && (r.text as string).trim())
      .map((r: Record<string, unknown>) => ({
        author: String(r.author_name || "Google reviewer"),
        rating: typeof r.rating === "number" ? r.rating : 5,
        text: String(r.text),
        when: String(r.relative_time_description || ""),
      })),
  }
}
