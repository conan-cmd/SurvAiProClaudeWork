import { NextRequest, NextResponse } from "next/server"
import { db } from "@/lib/db"
import { getCurrentUser } from "@/lib/session"
import { createDepositInvoice } from "@/lib/xero"

// Manually raise (or backfill) the Xero draft deposit invoice for a paid
// proposal — e.g. when the deposit landed before Xero was connected, so the
// automatic creation at payment time had nowhere to go.
export async function POST(
  _request: NextRequest,
  { params }: { params: { proposalId: string } }
) {
  const user = await getCurrentUser()
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  const proposal = await db.proposal.findFirst({
    where: { id: params.proposalId, organizationId: user.organizationId },
    select: { id: true, depositPaidAt: true, status: true },
  })
  if (!proposal) return NextResponse.json({ error: "Not found" }, { status: 404 })
  if (!proposal.depositPaidAt && proposal.status !== "DEPOSIT_PAID") {
    return NextResponse.json(
      { error: "No deposit has been paid on this proposal yet." },
      { status: 409 }
    )
  }

  const result = await createDepositInvoice(proposal.id)
  switch (result.status) {
    case "created":
    case "exists":
      return NextResponse.json({
        created: result.status === "created",
        invoiceNumber: result.invoiceNumber,
        balanceInvoiceNumber: result.balanceInvoiceNumber ?? null,
      })
    case "skipped":
      return NextResponse.json(
        {
          error:
            result.reason === "not_connected"
              ? "Xero isn't connected — connect it in Settings first."
              : "No deposit amount is due on this proposal.",
        },
        { status: 409 }
      )
    case "error":
      return NextResponse.json({ error: `Xero: ${result.message}` }, { status: 502 })
  }
}
