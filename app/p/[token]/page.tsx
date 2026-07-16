import { notFound } from "next/navigation"
import { db } from "@/lib/db"
import { ProposalDocument } from "@/components/proposal-document"

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
      </div>
      <p className="text-center text-xs text-gray-400 mt-6">
        Prepared with SurvAIPro
      </p>
    </main>
  )
}
