import { notFound } from "next/navigation"
import { db } from "@/lib/db"
import { ProposalDocument } from "@/components/proposal-document"
import { AcceptanceBlock } from "@/components/signature-pad"

export const dynamic = "force-dynamic"

export default async function SharedProposalPage({
  params,
}: {
  params: { token: string }
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
              email: true, phone: true, website: true,
            },
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

  const p = link.proposal

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
            organization: p.organization,
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
          </div>
        ) : (
          <AcceptanceBlock
            token={params.token}
            clientName={p.clientName}
            clientCompany={p.survey.clientCompany}
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
