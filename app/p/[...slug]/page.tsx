import { notFound } from "next/navigation"
import { db } from "@/lib/db"
import { ProposalDocument } from "@/components/proposal-document"
import { AcceptanceBlock } from "@/components/signature-pad"
import { DepositCard } from "@/components/deposit-card"
import { computeDeposit, retrieveCheckoutSession } from "@/lib/stripe"
import { calculateProposalTotals, formatCurrency, lineGross, applyMarkup } from "@/lib/utils"
import { ReadTracker } from "@/components/read-tracker"

export const dynamic = "force-dynamic"

// Best-effort "deposit received" email to the business when a client pays.
async function notifyDepositPaid(p: {
  id: string; clientName: string; depositAmount: number | null
  creatorEmail: string | null; orgEmail: string | null; title: string
}) {
  const { emailEnabled, sendEmail } = await import("@/lib/email")
  if (!emailEnabled()) return
  const to = p.creatorEmail || p.orgEmail
  if (!to) return
  const { publicBaseUrl } = await import("@/lib/public-url")
  const amount = p.depositAmount ? formatCurrency(p.depositAmount) : "The deposit"
  const url = `${publicBaseUrl("")}/proposals/${p.id}`
  const html = `
    <div style="font-family:-apple-system,'Segoe UI',Roboto,Arial,sans-serif;font-size:15px;line-height:1.6;color:#111827;max-width:520px">
      <p>💰 <strong>${p.clientName}</strong> has just paid their deposit of <strong>${amount}</strong> for <strong>${p.title}</strong>.</p>
      <p style="margin:18px 0"><a href="${url}" style="color:#2563EB;font-weight:600">Open the proposal &rarr;</a></p>
      <p style="color:#6b7280;font-size:13px">Time to get them booked in.</p>
    </div>`
  await sendEmail({
    to,
    subject: `💰 ${p.clientName} paid their deposit`,
    html,
    text: `${p.clientName} paid their deposit (${amount}) for ${p.title}.\n\nOpen it: ${url}`,
  })
}

export default async function SharedProposalPage({
  params,
  searchParams,
}: {
  params: { slug: string[] }
  searchParams: { session_id?: string }
}) {
  // Links are /p/<readable-slug>/<token>, but old links are /p/<token>. Either
  // way the secure token is the last path segment.
  const token = params.slug[params.slug.length - 1]

  const link = await db.shareLink.findUnique({
    where: { token },
    include: {
      proposal: {
        include: {
          sections: { orderBy: { order: "asc" } },
          pricingLineItems: { orderBy: { order: "asc" } },
          survey: {
            include: {
              photos: {
                where: { includeInProposal: true, internalOnly: false },
                orderBy: { order: "asc" },
              },
            },
          },
          organization: {
            select: {
              id: true, name: true, logoUrl: true, brandColor: true, secondaryColor: true,
              email: true, phone: true, website: true, depositRules: true, showCoordinatesOnProposal: true,
              signOffName: true, headshotUrl: true, signatureImageUrl: true,
              proposalIdentityMode: true, proposalIdentityUserId: true,
              stripeAccountId: true, stripeChargesEnabled: true,
            },
          },
          createdBy: {
            select: { id: true, name: true, email: true, signOffName: true, headshotUrl: true, signatureImageUrl: true },
          },
        },
      },
    },
  })

  if (!link || link.revoked || link.expiresAt < new Date()) {
    notFound()
  }

  // Fire-and-forget view tracking
  db.shareLink
    .update({
      where: { id: link.id },
      data: { viewCount: { increment: 1 }, lastViewedAt: new Date() },
    })
    .catch(() => {})

  let p = link.proposal

  // Returning from Stripe Checkout: verify payment server-side and record it
  if (
    searchParams.session_id &&
    p.stripeSessionId === searchParams.session_id &&
    !p.depositPaidAt
  ) {
    try {
      const connectedAccountId =
        p.organization.stripeChargesEnabled && p.organization.stripeAccountId
          ? p.organization.stripeAccountId
          : null
      const session = await retrieveCheckoutSession(searchParams.session_id, connectedAccountId)
      if (session.payment_status === "paid") {
        p = {
          ...p,
          ...(await db.proposal.update({
            where: { id: p.id },
            data: { depositPaidAt: new Date(), status: "DEPOSIT_PAID" },
          })),
        }
        // Notify the business their deposit landed (best-effort, first time only).
        notifyDepositPaid({
          id: p.id,
          clientName: p.clientName,
          depositAmount: p.depositAmount,
          creatorEmail: p.createdBy?.email ?? null,
          orgEmail: p.organization.email,
          title: p.survey.title,
        }).catch(() => {})
      }
    } catch (err) {
      console.error("Deposit verification failed:", err)
    }
  }

  // After signing, the deposit is based on the total the client actually agreed
  // to (base + any optional extras they selected), falling back to the base total
  // for proposals signed before optional-selection existed.
  // Apply any contractor markup so the client sees / signs / pays the marked-up
  // prices — with no sign of the markup itself.
  const markedItems = applyMarkup(p.pricingLineItems, p.markupType, p.markupValue)
  const agreedTotal = p.agreedTotal ?? calculateProposalTotals(markedItems).total
  const depositDue = p.signedAt && !p.depositPaidAt
    ? computeDeposit(p.organization.depositRules, p.survey.isResidential, agreedTotal)
    : 0

  // Whose name/email/headshot/signature represents this proposal (org default
  // or per-proposal override), resolved server-side.
  const { resolveProposalIdentity } = await import("@/lib/proposal-identity")
  const identity = await resolveProposalIdentity(p)

  return (
    <main className="min-h-screen bg-brand-gray py-6 px-3 md:py-10">
      <div className="max-w-3xl mx-auto bg-white rounded-xl shadow-sm p-4 md:p-10">
        <ProposalDocument
          data={{
            clientName: p.clientName,
            templateName: p.templateName,
            title: p.survey.title,
            clientCompany: p.survey.clientCompany,
            siteAddress: p.survey.clientAddress,
            sections: p.sections,
            pricingLineItems: markedItems,
            photos: p.survey.photos,
            latitude: p.survey.latitude,
            longitude: p.survey.longitude,
            what3words: p.survey.what3words,
            showCoordinates: p.organization.showCoordinatesOnProposal,
            organization: p.organization,
            preparer: { name: identity.name, signOffName: identity.name, headshotUrl: identity.headshotUrl, signatureImageUrl: identity.signatureImageUrl },
            contactEmail: identity.email,
            hideOptionalExtras: true,
          }}
        />
        {p.signedAt ? (
          <div className="mt-10 border rounded-xl p-6">
            <h3 className="text-lg font-bold text-gray-900 mb-2">Accepted</h3>
            {p.signatureImage && (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={p.signatureImage} alt="Signature" className="h-16 mb-2" />
            )}
            <p className="text-sm text-gray-600">
              {p.signedName}
              {p.signedPosition ? `, ${p.signedPosition}` : ""}
              {p.signedCompany ? ` — ${p.signedCompany}` : ""}
              {" · "}
              {new Intl.DateTimeFormat("en-GB").format(p.signedAt)}
            </p>
            {(() => {
              let ids: string[] = []
              try {
                ids = p.selectedOptionalIds ? JSON.parse(p.selectedOptionalIds) : []
              } catch {
                ids = []
              }
              const chosen = markedItems.filter((i) => ids.includes(i.id))
              if (!chosen.length && p.agreedTotal == null) return null
              return (
                <div className="mt-4 pt-4 border-t">
                  {chosen.length > 0 && (
                    <>
                      <p className="text-sm font-semibold text-gray-700 mb-1">Optional extras included:</p>
                      <ul className="text-sm text-gray-600 list-disc pl-5 mb-2">
                        {chosen.map((i) => (
                          <li key={i.id}>
                            {i.description} — {formatCurrency(lineGross(i))}
                          </li>
                        ))}
                      </ul>
                    </>
                  )}
                  {p.agreedTotal != null && (
                    <p className="text-sm text-gray-700">
                      Total agreed:{" "}
                      <span className="font-bold">{formatCurrency(p.agreedTotal)}</span>
                    </p>
                  )}
                </div>
              )
            })()}
          </div>
        ) : (
          <AcceptanceBlock
            token={token}
            clientName={p.clientName}
            clientCompany={p.survey.clientCompany}
            brandColor={p.organization.brandColor}
            baseTotal={calculateProposalTotals(markedItems).total}
            optionalItems={markedItems
              .filter((i) => i.isOptional)
              .map((i) => ({ id: i.id, description: i.description, amount: lineGross(i) }))}
          />
        )}
        {p.depositPaidAt && (
          <div className="mt-6 border-2 border-emerald-300 bg-emerald-50 rounded-xl p-6">
            <h3 className="text-lg font-bold text-emerald-800 mb-1">Deposit received ✓</h3>
            <p className="text-sm text-emerald-700">
              {p.depositAmount ? formatCurrency(p.depositAmount) : "Your deposit"} was paid on{" "}
              {new Intl.DateTimeFormat("en-GB").format(p.depositPaidAt)}. The remaining balance
              is due on completion — we&apos;ll be in touch to arrange your start date.
            </p>
          </div>
        )}
        {depositDue > 0 && (
          <DepositCard
            token={token}
            amountLabel={formatCurrency(depositDue)}
            brandColor={p.organization.brandColor}
          />
        )}
      </div>
      <p className="text-center text-xs text-gray-400 mt-6">
        Prepared with SurvAIPro
      </p>
      <ReadTracker token={token} />
    </main>
  )
}
