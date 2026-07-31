// Loads the Google Maps JS API once (browser only), with the geometry library
// for area/length maths. Uses NEXT_PUBLIC_GOOGLE_MAPS_API_KEY (browser key).
type GoogleNS = typeof window & { google?: { maps?: unknown } }

let loadPromise: Promise<void> | null = null

export function googleMapsKey(): string | undefined {
  return process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY
}

export function loadGoogleMaps(): Promise<void> {
  if (typeof window === "undefined") return Promise.reject(new Error("no window"))
  const w = window as GoogleNS
  if (w.google?.maps) return Promise.resolve()
  if (loadPromise) return loadPromise

  const key = googleMapsKey()
  loadPromise = new Promise((resolve, reject) => {
    if (!key) {
      reject(new Error("Maps key not configured"))
      return
    }
    const existing = document.getElementById("gmaps-js")
    if (existing) {
      existing.addEventListener("load", () => resolve())
      existing.addEventListener("error", () => reject(new Error("Failed to load Google Maps")))
      return
    }
    const s = document.createElement("script")
    s.id = "gmaps-js"
    s.src = `https://maps.googleapis.com/maps/api/js?key=${encodeURIComponent(key)}&libraries=geometry&loading=async&v=weekly`
    s.async = true
    s.onload = () => resolve()
    s.onerror = () => reject(new Error("Failed to load Google Maps"))
    document.head.appendChild(s)
  })
  return loadPromise
}
