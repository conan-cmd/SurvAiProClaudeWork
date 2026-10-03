import "server-only"
import { db } from "@/lib/db"
import { formatCurrency } from "@/lib/utils"

// Records a paid deposit exactly once and fires the side effects (Xero draft
// invoices, deposit-paid alert email). Called from both the client's return
// page and the Stripe webhook — whichever lands first wins; the other no-ops.
export async function markDepositPaid(proposalId: string): Promise<{ depositPaidAt: Date } | null> {
  const now = new Date()
  // updateMany + the null guard is the idempotency gate.
  const res = await db.proposal.updateMany({
    where: { id: proposalId, depositPaidAt: null },
    data: { depositPaidAt: now, status: "DEPOSIT_PAID" },
  })
  if (res.count === 0) return null

  // Best-effort side effects — never block or fail the payment record.
  import("@/lib/xero").then((m) => m.createDepositInvoice(proposalId)).catch(() => {})
  notifyDepositPaid(proposalId).catch((err) => console.error("Deposit alert email failed:", err))
  return { depositPaidAt: now }
}

// "💰 deposit received" email. Recipients come from Settings → deposit paid
// alerts, falling back to the proposal creator, then the org Contact email.
async function notifyDepositPaid(proposalId: string) {
  const { emailEnabled, sendEmail } = await import("@/lib/email")
  if (!emailEnabled()) return
  const p = await db.proposal.findUnique({
    where: { id: proposalId },
    select: {
      id: true,
      clientName: true,
      depositAmount: true,
      createdBy: { select: { email: true } },
      organization: { select: { email: true, depositAlertEmails: true } },
      survey: { select: { title: true } },
    },
  })
  if (!p) return
  const to = (p.organization.depositAlertEmails || p.createdBy?.email || p.organization.email || "")
    .split(/[,;\s]+/)
    .map((e) => e.trim())
    .filter((e) => /.+@.+\..+/.test(e))
  if (!to.length) return

  const { publicBaseUrl } = await import("@/lib/public-url")
  const amount = p.depositAmount ? formatCurrency(p.depositAmount) : "The deposit"
  const url = `${publicBaseUrl("")}/proposals/${p.id}`
  await sendEmail({
    to,
    subject: `💰 ${p.clientName} paid their deposit`,
    html: `
      <div style="font-family:-apple-system,'Segoe UI',Roboto,Arial,sans-serif;font-size:15px;line-height:1.6;color:#111827;max-width:520px">
        <p>💰 <strong>${p.clientName}</strong> has just paid their deposit of <strong>${amount}</strong> for <strong>${p.survey.title}</strong>.</p>
        <p style="margin:18px 0"><a href="${url}" style="color:#2563EB;font-weight:600">Open the proposal &rarr;</a></p>
        <p style="color:#6b7280;font-size:13px">Time to get them booked in.</p>
      </div>`,
    text: `${p.clientName} paid their deposit (${amount}) for ${p.survey.title}.\n\nOpen it: ${url}`,
  })
}
