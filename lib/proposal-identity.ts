import "server-only"
import { db } from "@/lib/db"

// Who represents a proposal — the email/reply-to/sender plus the name, headshot
// and signature shown on it. Chosen per-org in Settings and optionally overridden
// per-proposal (see Organization.proposalIdentityMode / Proposal.identityMode).
export type IdentityMode = "CREATOR" | "USER" | "ORG"

export type ResolvedIdentity = {
  // The user this identity belongs to (used to send from their Gmail if connected);
  // null when the identity is the organisation's own details.
  userId: string | null
  name: string | null
  email: string | null
  headshotUrl: string | null
  signatureImageUrl: string | null
}

type UserLike =
  | {
      id?: string | null
      name?: string | null
      email?: string | null
      signOffName?: string | null
      headshotUrl?: string | null
      signatureImageUrl?: string | null
    }
  | null
  | undefined

type OrgLike = {
  id: string
  name: string
  email?: string | null
  signOffName?: string | null
  headshotUrl?: string | null
  signatureImageUrl?: string | null
  proposalIdentityMode?: string | null
  proposalIdentityUserId?: string | null
}

type ProposalLike = {
  identityMode?: string | null
  identityUserId?: string | null
  createdBy?: UserLike
  organization: OrgLike
}

function fromUser(u: UserLike): ResolvedIdentity | null {
  if (!u) return null
  return {
    userId: u.id ?? null,
    name: u.signOffName || u.name || null,
    email: u.email || null,
    headshotUrl: u.headshotUrl || null,
    signatureImageUrl: u.signatureImageUrl || null,
  }
}

// Resolves the effective identity for a proposal: a per-proposal override wins,
// else the org default, else the proposal creator. Any missing field is filled
// from the org so a partial personal identity still renders completely.
export async function resolveProposalIdentity(proposal: ProposalLike): Promise<ResolvedIdentity> {
  const org = proposal.organization
  const orgIdentity: ResolvedIdentity = {
    userId: null,
    name: org.signOffName || org.name || null,
    email: org.email || null,
    headshotUrl: org.headshotUrl || null,
    signatureImageUrl: org.signatureImageUrl || null,
  }

  // A per-proposal override (non-null identityMode) takes precedence over the org.
  const override = proposal.identityMode || null
  const mode = (override || org.proposalIdentityMode || "CREATOR") as IdentityMode
  const userId = override ? proposal.identityUserId : org.proposalIdentityUserId

  let picked: ResolvedIdentity | null = null
  if (mode === "ORG") {
    picked = orgIdentity
  } else if (mode === "USER" && userId) {
    if (proposal.createdBy?.id === userId) {
      picked = fromUser(proposal.createdBy)
    } else {
      const u = await db.user.findFirst({
        where: { id: userId, organizationId: org.id },
        select: { id: true, name: true, email: true, signOffName: true, headshotUrl: true, signatureImageUrl: true },
      })
      picked = fromUser(u)
    }
  } else {
    // CREATOR (default), or USER with no person chosen yet.
    picked = fromUser(proposal.createdBy)
  }
  picked = picked || orgIdentity

  return {
    userId: picked.userId,
    name: picked.name || orgIdentity.name,
    email: picked.email || orgIdentity.email,
    headshotUrl: picked.headshotUrl || orgIdentity.headshotUrl,
    signatureImageUrl: picked.signatureImageUrl || orgIdentity.signatureImageUrl,
  }
}
