import { notFound } from "next/navigation"
import { db } from "@/lib/db"
import { ProposalDocument } from "@/components/proposal-document"
import { AcceptanceBlock } from "@/components/signature-pad"
import { DepositCard } from "@/components/deposit-card"
import { computeDeposit, retrieveCheckoutSession } from "@/lib/stripe"
import { calculateProposalTotals, formatCurrency, lineGross } from "@/lib/utils"

export const dynamic = "force-dynamic"

export default async function SharedProposalPage({
  params,
  searchParams,
}: {
  params: { token: string }
  searchParams: { session_id?: string }
}) {
  const link = await db.shareLink.findUnique({
    where: { token: params.token },
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
              name: true, logoUrl: true, brandColor: true, secondaryColor: true,
              email: true, phone: true, website: true, depositRules: true,
              signOffName: true, headshotUrl: true, signatureImageUrl: true,
            },
          },
          createdBy: {
            select: { name: true, signOffName: true, headshotUrl: true, signatureImageUrl: true },
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
      const session = await retrieveCheckoutSession(searchParams.session_id)
      if (session.payment_status === "paid") {
        p = {
          ...p,
          ...(await db.proposal.update({
            where: { id: p.id },
            data: { depositPaidAt: new Date(), status: "DEPOSIT_PAID" },
          })),
        }
      }
    } catch (err) {
      console.error("Deposit verification failed:", err)
    }
  }

  // After signing, the deposit is based on the total the client actually agreed
  // to (base + any optional extras they selected), falling back to the base total
  // for proposals signed before optional-selection existed.
  const agreedTotal = p.agreedTotal ?? calculateProposalTotals(p.pricingLineItems).total
  const depositDue = p.signedAt && !p.depositPaidAt
    ? computeDeposit(p.organization.depositRules, p.survey.isResidential, agreedTotal)
    : 0

  return (
    <main className="min-h-screen bg-brand-gray py-6 px-3 md:py-10">
      <div className="max-w-3xl mx-auto bg-white rounded-xl shadow-sm p-4 md:p-10">
        <ProposalDocument
          data={{
            clientName: p.clientName,
            templateName: p.templateName,
            sections: p.sections,
            pricingLineItems: p.pricingLineItems,
            photos: p.survey.photos,
            latitude: p.survey.latitude,
            longitude: p.survey.longitude,
            organization: p.organization,
            preparer: p.createdBy,
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
              const chosen = p.pricingLineItems.filter((i) => ids.includes(i.id))
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
            token={params.token}
            clientName={p.clientName}
            clientCompany={p.survey.clientCompany}
            brandColor={p.organization.brandColor}
            baseTotal={calculateProposalTotals(p.pricingLineItems).total}
            optionalItems={p.pricingLineItems
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
            token={params.token}
            amountLabel={formatCurrency(depositDue)}
            brandColor={p.organization.brandColor}
          />
        )}
      </div>
      <p className="text-center text-xs text-gray-400 mt-6">
        Prepared with SurvAIPro
      </p>
    </main>
  )
}
