import { type ClassValue, clsx } from "clsx"
import { twMerge } from "tailwind-merge"

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

export function formatCurrency(amount: number): string {
  return new Intl.NumberFormat("en-GB", {
    style: "currency",
    currency: "GBP",
  }).format(amount)
}

export function formatDate(date: Date): string {
  return new Intl.DateTimeFormat("en-GB", {
    year: "numeric",
    month: "long",
    day: "numeric",
  }).format(date)
}

export type PricingItem = {
  quantity: number
  unitPrice: number
  vat: number // percentage per line
  discount: number // percentage per line
  isOptional: boolean
}

export function lineNet(item: PricingItem): number {
  const gross = item.quantity * item.unitPrice
  return gross - (gross * item.discount) / 100
}

// Line total including its own VAT - used when a client adds an optional extra
// to their agreed total at sign time.
export function lineGross(item: PricingItem): number {
  const net = lineNet(item)
  return net + (net * item.vat) / 100
}

// Optional items are shown but excluded from totals until accepted.
export function calculateProposalTotals(items: PricingItem[]) {
  const included = items.filter((i) => !i.isOptional)
  const subtotal = included.reduce((sum, i) => sum + lineNet(i), 0)
  const vat = included.reduce((sum, i) => sum + (lineNet(i) * i.vat) / 100, 0)
  return { subtotal, vat, total: subtotal + vat }
}
