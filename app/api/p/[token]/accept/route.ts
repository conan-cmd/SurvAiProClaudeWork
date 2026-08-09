import { NextRequest, NextResponse } from "next/server"
import { z } from "zod"
import { db } from "@/lib/db"
import { calculateProposalTotals, lineGross, applyMarkup } from "@/lib/utils"

const acceptSchema = z.object({
  name: z.string().min(2, "Please enter your full name"),
  position: z.string().max(100).optional(),
  company: z.string().max(150).optional(),
  signature: z.string().startsWith("data:image/").max(500_000),
  // IDs of optional line items the client ticked to include in their order
  selectedOptionalIds: z.array(z.string()).optional(),
})

// Public endpoint: the client accepts and signs via their secure share link.
export async function POST(
  request: NextRequest,
  { params }: { params: { token: string } }
) {
  const link = await db.shareLink.findUnique({
    where: { token: params.token },
    include: {
      proposal: {
        select: {
          id: true,
          status: true,
          signedAt: true,
          clientName: true,
          markupType: true,
          markupValue: true,
          createdBy: { select: { email: true, name: true } },
          organization: { select: { name: true, email: true } },
          survey: { select: { title: true } },
          pricingLineItems: {
            select: {
              id: true, quantity: true, unitPrice: true,
              vat: true, discount: true, isOptional: true,
            },
          },
        },
      },
    },
  })
  if (!link || link.revoked || link.expiresAt < new Date()) {
    return NextResponse.json({ error: "This link is no longer valid" }, { status: 404 })
  }
  if (link.proposal.signedAt || link.proposal.status === "SIGNED" || link.proposal.status === "WON") {
    return NextResponse.json({ error: "This proposal has already been accepted" }, { status: 409 })
  }

  const parsed = acceptSchema.safeParse(await request.json())
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.errors[0].message }, { status: 400 })
  }

  // Recompute the agreed total server-side - never trust a total from the client.
  // Apply any contractor markup first so the client signs for the marked-up price.
  // Only optional items that actually belong to this proposal are honoured.
  const items = applyMarkup(
    link.proposal.pricingLineItems,
    link.proposal.markupType,
    link.proposal.markupValue
  )
  const requestedIds = new Set(parsed.data.selectedOptionalIds ?? [])
  const chosenOptional = items.filter((i) => i.isOptional && requestedIds.has(i.id))
  const base = calculateProposalTotals(items).total
  const optionalsTotal = chosenOptional.reduce((sum, i) => sum + lineGross(i), 0)
  const agreedTotal = Math.round((base + optionalsTotal) * 100) / 100

  await db.proposal.update({
    where: { id: link.proposal.id },
    data: {
      status: "SIGNED",
      signedAt: new Date(),
      signedName: parsed.data.name,
      signedPosition: parsed.data.position || null,
      signedCompany: parsed.data.company || null,
      signatureImage: parsed.data.signature,
      selectedOptionalIds: chosenOptional.length
        ? JSON.stringify(chosenOptional.map((i) => i.id))
        : null,
      agreedTotal,
    },
  })

  // Let the business know their proposal was just accepted (best-effort).
  notifySigned(link.proposal, agreedTotal, request.nextUrl.origin).catch(() => {})

  // Mark the Pipedrive deal won (best-effort).
  const { syncProposalToPipedrive } = await import("@/lib/pipedrive")
  await syncProposalToPipedrive(link.proposal.id)

  return NextResponse.json({ success: true })
}

type SignedProposal = {
  id: string
  clientName: string
  createdBy: { email: string; name: string | null } | null
  organization: { name: string; email: string | null }
  survey: { title: string }
}

async function notifySigned(p: SignedProposal, agreedTotal: number, origin: string) {
  const { emailEnabled, sendEmail } = await import("@/lib/email")
  if (!emailEnabled()) return
  const to = p.createdBy?.email || p.organization.email
  if (!to) return

  const { publicBaseUrl } = await import("@/lib/public-url")
  const { formatCurrency } = await import("@/lib/utils")
  const url = `${publicBaseUrl(origin)}/proposals/${p.id}`
  const html = `
    <div style="font-family:-apple-system,'Segoe UI',Roboto,Arial,sans-serif;font-size:15px;line-height:1.6;color:#111827;max-width:520px">
      <p>🎉 <strong>${p.clientName}</strong> has just accepted your proposal for <strong>${p.survey.title}</strong>.</p>
      <p>Agreed total: <strong>${formatCurrency(agreedTotal)}</strong></p>
      <p style="margin:18px 0"><a href="${url}" style="color:#2563EB;font-weight:600">Open the proposal &rarr;</a></p>
      <p style="color:#6b7280;font-size:13px">If a deposit is due, the client is now being prompted to pay it.</p>
    </div>`
  await sendEmail({
    to,
    subject: `✅ ${p.clientName} accepted your proposal`,
    html,
    text: `${p.clientName} has accepted your proposal for ${p.survey.title}. Agreed total: ${formatCurrency(agreedTotal)}.\n\nOpen it: ${url}`,
  })
}
