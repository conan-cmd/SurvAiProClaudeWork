// Loads the Google Maps JS API once (browser only), with the geometry library
// for area/length maths. Uses NEXT_PUBLIC_GOOGLE_MAPS_API_KEY (browser key).
type GoogleNS = typeof window & { google?: { maps?: { Map?: unknown } } }

let loadPromise: Promise<void> | null = null

export function googleMapsKey(): string | undefined {
  return process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY
}

export function loadGoogleMaps(): Promise<void> {
  if (typeof window === "undefined") return Promise.reject(new Error("no window"))
  const w = window as GoogleNS
  if (w.google?.maps?.Map) return Promise.resolve()
  if (loadPromise) return loadPromise

  const key = googleMapsKey()
  loadPromise = new Promise<void>((resolve, reject) => {
    if (!key) {
      reject(new Error("Maps key not configured"))
      return
    }

    // With loading=async, the script's `load` event fires BEFORE google.maps.Map
    // exists — resolving there caused intermittent "new Map is not a constructor".
    // Google invokes this callback only once the API (incl. our libraries) is
    // fully ready, which is the reliable signal.
    const cb = "__survaiGmapsReady"
    ;(window as unknown as Record<string, unknown>)[cb] = () => resolve()

    const existing = document.getElementById("gmaps-js")
    if (existing) {
      // Script already present (e.g. after a client-side remount) — wait until the
      // classes are actually available rather than assuming they are.
      let tries = 0
      const check = () => {
        if ((window as GoogleNS).google?.maps?.Map) resolve()
        else if (tries++ > 100) reject(new Error("Google Maps didn't initialise"))
        else setTimeout(check, 100)
      }
      check()
      return
    }

    const s = document.createElement("script")
    s.id = "gmaps-js"
    s.src = `https://maps.googleapis.com/maps/api/js?key=${encodeURIComponent(key)}&libraries=geometry&loading=async&v=weekly&callback=${cb}`
    s.async = true
    s.onerror = () => reject(new Error("Failed to load Google Maps"))
    document.head.appendChild(s)
  })

  // Don't cache a failure forever — allow a later attempt (e.g. flaky connection).
  loadPromise.catch(() => { loadPromise = null })
  return loadPromise
}
