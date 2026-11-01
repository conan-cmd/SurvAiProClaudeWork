import "server-only"
import { db } from "@/lib/db"
import { performNudge } from "@/lib/nudge-send"
import { parseScheduledNudge } from "@/lib/scheduled-nudge-parse"

// Sends every due scheduled nudge. Called by the daily Vercel cron (all orgs)
// and piggybacked on page loads (that user's org only), so Monday-morning
// sends go out as scheduled even on quiet accounts. Claims each row
// atomically, so concurrent triggers can't double-send; a failed send is
// retried on later runs, up to 5 attempts.
export async function processDueScheduledNudges(orgId?: string): Promise<number> {
  const candidates = await db.proposal.findMany({
    where: { scheduledNudge: { not: null }, ...(orgId ? { organizationId: orgId } : {}) },
    select: { id: true, scheduledNudge: true },
    take: 200,
  })
  let sent = 0
  for (const p of candidates) {
    const sched = parseScheduledNudge(p.scheduledNudge)
    if (!sched) {
      await db.proposal.update({ where: { id: p.id }, data: { scheduledNudge: null } }).catch(() => {})
      continue
    }
    if (Date.parse(sched.at) > Date.now()) continue

    // Atomic claim: only proceed if this exact payload is still there.
    const claim = await db.proposal.updateMany({
      where: { id: p.id, scheduledNudge: p.scheduledNudge },
      data: { scheduledNudge: null },
    })
    if (!claim.count) continue

    try {
      const sender = await db.user.findUnique({
        where: { id: sched.by },
        select: { id: true, name: true, email: true },
      })
      if (!sender) throw new Error("Scheduling user no longer exists")
      await performNudge(p.id, sched, sender)
      sent++
    } catch (err) {
      console.error("Scheduled nudge failed:", p.id, err)
      const attempts = (sched.attempts || 0) + 1
      if (attempts < 5) {
        // Put it back for the next run.
        await db.proposal
          .update({ where: { id: p.id }, data: { scheduledNudge: JSON.stringify({ ...sched, attempts }) } })
          .catch(() => {})
      }
    }
  }
  return sent
}
