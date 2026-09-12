"use client"

import {
  createContext, useContext, useEffect, useMemo, useRef, useState, type ReactNode,
} from "react"
import { createPortal } from "react-dom"
import { X, ZoomIn, ZoomOut, ChevronLeft, ChevronRight } from "lucide-react"

const MIN_ZOOM = 1
const MAX_ZOOM = 6

// An <img> that opens full-screen on tap, showing the original file with
// pinch-to-zoom (touch), scroll-wheel zoom and drag-to-pan (desktop), and
// double-tap to zoom. Used for survey/proposal photos so viewers can inspect
// detail the thumbnail crop hides.
//
// Wrap a photo grid in <ZoomableGallery> and its images become one gallery:
// the lightbox gains prev/next arrows, arrow-key and swipe navigation, and a
// position counter, so viewers flick through every photo without closing.

type GalleryItem = { id: number; src: string; alt: string; caption?: string | null }

type GalleryApi = {
  register: (item: Omit<GalleryItem, "id">) => number
  update: (id: number, item: Omit<GalleryItem, "id">) => void
  unregister: (id: number) => void
  open: (id: number) => void
}

const GalleryCtx = createContext<GalleryApi | null>(null)

export function ZoomableGallery({ children }: { children: ReactNode }) {
  const nextId = useRef(0)
  // Registration follows render order, so ids sort into visual grid order.
  const items = useRef(new Map<number, GalleryItem>())
  const [openId, setOpenId] = useState<number | null>(null)

  const api = useMemo<GalleryApi>(
    () => ({
      register: (item) => {
        const id = nextId.current++
        items.current.set(id, { id, ...item })
        return id
      },
      update: (id, item) => items.current.set(id, { id, ...item }),
      unregister: (id) => items.current.delete(id),
      open: (id) => setOpenId(id),
    }),
    []
  )

  const ordered = [...items.current.values()].sort((a, b) => a.id - b.id)
  const index = openId === null ? -1 : ordered.findIndex((i) => i.id === openId)
  const current = index >= 0 ? ordered[index] : null
  const step = (dir: 1 | -1) => {
    if (!ordered.length) return
    setOpenId(ordered[(index + dir + ordered.length) % ordered.length].id)
  }

  return (
    <GalleryCtx.Provider value={api}>
      {children}
      {current && (
        // Keyed by photo so navigation remounts the lightbox with zoom reset.
        <Lightbox
          key={current.id}
          src={current.src}
          alt={current.alt}
          caption={current.caption}
          onClose={() => setOpenId(null)}
          onPrev={ordered.length > 1 ? () => step(-1) : undefined}
          onNext={ordered.length > 1 ? () => step(1) : undefined}
          position={ordered.length > 1 ? `${index + 1} / ${ordered.length}` : undefined}
        />
      )}
    </GalleryCtx.Provider>
  )
}

export function ZoomableImage({
  src,
  alt,
  className,
  caption,
}: {
  src: string
  alt: string
  className?: string
  caption?: string | null
}) {
  const [open, setOpen] = useState(false)
  const gallery = useContext(GalleryCtx)
  const galleryId = useRef<number | null>(null)

  useEffect(() => {
    if (!gallery) return
    if (galleryId.current === null) galleryId.current = gallery.register({ src, alt, caption })
    else gallery.update(galleryId.current, { src, alt, caption })
  }, [gallery, src, alt, caption])
  useEffect(() => {
    if (!gallery) return
    return () => {
      if (galleryId.current !== null) gallery.unregister(galleryId.current)
      galleryId.current = null
    }
  }, [gallery])

  return (
    <>
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src={src}
        alt={alt}
        className={`${className || ""} cursor-zoom-in`}
        onClick={() =>
          gallery && galleryId.current !== null ? gallery.open(galleryId.current) : setOpen(true)
        }
      />
      {open && !gallery && (
        <Lightbox src={src} alt={alt} caption={caption} onClose={() => setOpen(false)} />
      )}
    </>
  )
}

type View = { x: number; y: number; s: number }

function Lightbox({
  src,
  alt,
  caption,
  onClose,
  onPrev,
  onNext,
  position,
}: {
  src: string
  alt: string
  caption?: string | null
  onClose: () => void
  onPrev?: () => void
  onNext?: () => void
  position?: string
}) {
  const [view, setView] = useState<View>({ x: 0, y: 0, s: 1 })
  const viewRef = useRef(view)
  viewRef.current = view
  const overlayRef = useRef<HTMLDivElement>(null)
  // Active pointers + the pan/pinch state captured when the gesture began.
  const pointers = useRef(new Map<number, { x: number; y: number }>())
  const gesture = useRef<{ view: View; mid: { x: number; y: number }; dist: number } | null>(null)

  const clamp = (s: number) => Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, s))
  const centered = (clientX: number, clientY: number) => ({
    x: clientX - window.innerWidth / 2,
    y: clientY - window.innerHeight / 2,
  })
  const settle = (v: View): View => (v.s <= 1.001 ? { x: 0, y: 0, s: 1 } : v)

  // Zoom keeping the screen point (cx, cy) anchored.
  const zoomAt = (clientX: number, clientY: number, factor: number) => {
    const v = viewRef.current
    const ns = clamp(v.s * factor)
    const k = ns / v.s
    const c = centered(clientX, clientY)
    setView(settle({ x: c.x - (c.x - v.x) * k, y: c.y - (c.y - v.y) * k, s: ns }))
  }

  const beginGesture = () => {
    const pts = [...pointers.current.values()]
    if (!pts.length) {
      gesture.current = null
      return
    }
    const mid = pts.length > 1
      ? { x: (pts[0].x + pts[1].x) / 2, y: (pts[0].y + pts[1].y) / 2 }
      : pts[0]
    const dist = pts.length > 1 ? Math.hypot(pts[0].x - pts[1].x, pts[0].y - pts[1].y) : 0
    gesture.current = { view: viewRef.current, mid, dist }
  }

  const onPointerDown = (e: React.PointerEvent) => {
    ;(e.target as Element).setPointerCapture?.(e.pointerId)
    pointers.current.set(e.pointerId, { x: e.clientX, y: e.clientY })
    beginGesture()
  }

  const onPointerMove = (e: React.PointerEvent) => {
    if (!pointers.current.has(e.pointerId)) return
    pointers.current.set(e.pointerId, { x: e.clientX, y: e.clientY })
    const g = gesture.current
    if (!g) return
    const pts = [...pointers.current.values()]
    if (pts.length > 1) {
      // Pinch: scale by finger spread, anchored on the (moving) midpoint.
      const mid = { x: (pts[0].x + pts[1].x) / 2, y: (pts[0].y + pts[1].y) / 2 }
      const dist = Math.hypot(pts[0].x - pts[1].x, pts[0].y - pts[1].y)
      const ns = clamp(g.view.s * (g.dist > 0 ? dist / g.dist : 1))
      const k = ns / g.view.s
      const mc = centered(mid.x, mid.y)
      const gc = centered(g.mid.x, g.mid.y)
      setView({ x: mc.x - (gc.x - g.view.x) * k, y: mc.y - (gc.y - g.view.y) * k, s: ns })
    } else if (viewRef.current.s > 1) {
      // One finger / mouse drag: pan.
      setView({
        x: g.view.x + (pts[0].x - g.mid.x),
        y: g.view.y + (pts[0].y - g.mid.y),
        s: viewRef.current.s,
      })
    }
  }

  const onPointerEnd = (e: React.PointerEvent) => {
    // A quick un-zoomed horizontal drag is a swipe between photos (a zoomed
    // single-finger drag stays a pan).
    const g = gesture.current
    const last = pointers.current.get(e.pointerId)
    const wasSingle = pointers.current.size === 1
    pointers.current.delete(e.pointerId)
    if (wasSingle && g && last && viewRef.current.s <= 1.001) {
      const dx = last.x - g.mid.x
      const dy = last.y - g.mid.y
      if (Math.abs(dx) > 60 && Math.abs(dx) > Math.abs(dy) * 1.5) {
        if (dx < 0) onNext?.()
        else onPrev?.()
      }
    }
    setView((v) => settle(v))
    beginGesture()
  }

  // Wheel zoom needs a non-passive listener to stop the page scrolling behind.
  useEffect(() => {
    const el = overlayRef.current
    if (!el) return
    const onWheel = (e: WheelEvent) => {
      e.preventDefault()
      zoomAt(e.clientX, e.clientY, e.deltaY < 0 ? 1.25 : 0.8)
    }
    el.addEventListener("wheel", onWheel, { passive: false })
    return () => el.removeEventListener("wheel", onWheel)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose()
      if (e.key === "ArrowLeft") onPrev?.()
      if (e.key === "ArrowRight") onNext?.()
    }
    document.addEventListener("keydown", onKey)
    const prev = document.body.style.overflow
    document.body.style.overflow = "hidden"
    return () => {
      document.removeEventListener("keydown", onKey)
      document.body.style.overflow = prev
    }
  }, [onClose, onPrev, onNext])

  const btn = "p-2 rounded-full bg-black/50 text-white hover:bg-black/70"

  return createPortal(
    <div
      ref={overlayRef}
      className="no-print fixed inset-0 z-[100] bg-black/90 flex items-center justify-center select-none"
      style={{ touchAction: "none" }}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerEnd}
      onPointerCancel={onPointerEnd}
      onDoubleClick={(e) => {
        if (viewRef.current.s > 1) setView({ x: 0, y: 0, s: 1 })
        else zoomAt(e.clientX, e.clientY, 2.5)
      }}
    >
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src={src}
        alt={alt}
        draggable={false}
        className="max-w-full max-h-full object-contain"
        style={{
          transform: `translate(${view.x}px, ${view.y}px) scale(${view.s})`,
          transition: pointers.current.size ? "none" : "transform 120ms ease-out",
          cursor: view.s > 1 ? "grab" : "zoom-in",
        }}
      />
      {onPrev && (
        <button type="button" aria-label="Previous photo"
          className={`${btn} absolute left-2 sm:left-4 top-1/2 -translate-y-1/2`}
          onPointerDown={(e) => e.stopPropagation()}
          onClick={(e) => { e.stopPropagation(); onPrev() }}>
          <ChevronLeft className="w-6 h-6" />
        </button>
      )}
      {onNext && (
        <button type="button" aria-label="Next photo"
          className={`${btn} absolute right-2 sm:right-4 top-1/2 -translate-y-1/2`}
          onPointerDown={(e) => e.stopPropagation()}
          onClick={(e) => { e.stopPropagation(); onNext() }}>
          <ChevronRight className="w-6 h-6" />
        </button>
      )}
      <div className="absolute top-3 right-3 flex items-center gap-2">
        <button type="button" aria-label="Zoom out" className={btn}
          onPointerDown={(e) => e.stopPropagation()}
          onClick={(e) => { e.stopPropagation(); zoomAt(window.innerWidth / 2, window.innerHeight / 2, 0.67) }}>
          <ZoomOut className="w-5 h-5" />
        </button>
        <button type="button" aria-label="Zoom in" className={btn}
          onPointerDown={(e) => e.stopPropagation()}
          onClick={(e) => { e.stopPropagation(); zoomAt(window.innerWidth / 2, window.innerHeight / 2, 1.5) }}>
          <ZoomIn className="w-5 h-5" />
        </button>
        <button type="button" aria-label="Close" className={btn}
          onPointerDown={(e) => e.stopPropagation()}
          onClick={(e) => { e.stopPropagation(); onClose() }}>
          <X className="w-5 h-5" />
        </button>
      </div>
      {position && (
        <div className="absolute top-4 left-1/2 -translate-x-1/2 text-sm font-medium text-white/80 bg-black/40 rounded-full px-3 py-1 pointer-events-none">
          {position}
        </div>
      )}
      {caption && (
        <div className="absolute bottom-0 inset-x-0 bg-black/60 text-white text-sm text-center px-4 py-2.5">
          {caption}
        </div>
      )}
      <div className="absolute top-4 left-3 text-[11px] text-white/50 pointer-events-none hidden sm:block">
        {onPrev ? "← → between photos · scroll to zoom · Esc to close" : "Scroll or double-click to zoom · drag to pan · Esc to close"}
      </div>
    </div>,
    document.body
  )
}
