"use client"

import type { ReactNode } from "react"

// WhatsApp sharing that actually opens the app on phones. wa.me works
// everywhere but on mobile routes through a "Continue to chat" interstitial
// page (and dies silently in some in-app browsers); the whatsapp:// scheme
// jumps straight into the app. Desktop keeps wa.me → WhatsApp Web.

export const isMobileUA = () =>
  typeof navigator !== "undefined" &&
  (/Android|iPhone|iPad|iPod/i.test(navigator.userAgent) ||
    // iPadOS reports itself as a Mac, but Macs don't have multi-touch screens.
    (/Mac/.test(navigator.userAgent) && navigator.maxTouchPoints > 1))

export const waWebUrl = (text: string, phone?: string) =>
  `https://wa.me/${phone || ""}?text=${encodeURIComponent(text)}`

export const waAppUrl = (text: string, phone?: string) =>
  `whatsapp://send?${phone ? `phone=${phone}&` : ""}text=${encodeURIComponent(text)}`

// For handlers that must share after async work (where window.open would be
// popup-blocked): navigate the current tab into the app on mobile instead.
export function openWhatsApp(text: string, phone?: string) {
  if (isMobileUA()) window.location.href = waAppUrl(text, phone)
  else window.open(waWebUrl(text, phone), "_blank", "noopener")
}

// Drop-in share anchor: renders a stable wa.me href (SSR-safe, works without
// JS) and upgrades the click to the app deep link on mobile.
export function WhatsAppLink({
  text,
  phone,
  className,
  children,
}: {
  text: string
  phone?: string
  className?: string
  children: ReactNode
}) {
  return (
    <a
      href={waWebUrl(text, phone)}
      target="_blank"
      rel="noopener noreferrer"
      onClick={(e) => {
        if (!isMobileUA()) return
        e.preventDefault()
        window.location.href = waAppUrl(text, phone)
      }}
      className={className}
    >
      {children}
    </a>
  )
}
