import "server-only"

// Minimal shape both getCurrentUser() results and plain user records satisfy.
type UserLike = { role: string; canSendProposals?: boolean }

// Owners and admins can always send. A member can send unless they've been set to
// draft-only (canSendProposals = false), in which case a proposal must be signed
// off (approvalStatus APPROVED) before it can go out.
export function userCanSend(user: UserLike): boolean {
  if (user.role === "OWNER" || user.role === "ADMIN") return true
  return user.canSendProposals !== false
}

// Who can review/sign off other people's proposals.
export function isApprover(user: UserLike): boolean {
  return user.role === "OWNER" || user.role === "ADMIN"
}

// A restricted subcontractor login — Job Reports only, sees only their own.
export function isContractor(user: UserLike): boolean {
  return user.role === "CONTRACTOR"
}

// Owners/admins see all job reports in the org; everyone else sees only their own.
export function canSeeAllJobReports(user: UserLike): boolean {
  return user.role === "OWNER" || user.role === "ADMIN"
}

// If a draft-only user edits an already-approved proposal, the sign-off no longer
// applies to the changed content — clear it so it must be re-submitted.
export async function resetApprovalIfEdited(
  proposalId: string,
  user: UserLike,
  proposal: { approvalStatus?: string | null }
): Promise<void> {
  if (isApprover(user)) return
  if (proposal.approvalStatus !== "APPROVED" && proposal.approvalStatus !== "PENDING") return
  const { db } = await import("@/lib/db")
  await db.proposal.update({
    where: { id: proposalId },
    data: { approvalStatus: "NONE", submittedAt: null, submittedById: null, reviewedAt: null, reviewedById: null },
  })
}

// Can this user email a client this specific proposal right now?
export function canSendProposal(
  user: UserLike,
  proposal: { approvalStatus?: string | null }
): boolean {
  if (userCanSend(user)) return true
  return proposal.approvalStatus === "APPROVED"
}
