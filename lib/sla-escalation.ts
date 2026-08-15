import { db } from "@/lib/db";
import { slaSnapshot } from "@/lib/sla";
import { runAutomations } from "@/lib/automations";

// ---------------------------------------------------------------------------
// SLA escalation sweep. Periodically scans open, unresolved tickets that carry
// an SLA deadline, computes the live SLA state, and fires the SLA automation
// triggers:
//   • first time a ticket is BREACHED (and escalatedAt is still null) →
//     stamp escalatedAt=now and run TICKET_SLA_BREACHED.
//   • when a ticket is AT_RISK (and not yet escalated) → run TICKET_SLA_AT_RISK,
//     but do NOT stamp escalatedAt (at-risk fires before breach).
//
// Idempotency: escalatedAt is the persistent guard against re-firing the breach
// trigger. At-risk has no column, so we track fired ids in a per-process Set —
// each ticket fires at-risk at most once per server lifetime (good enough to
// avoid spamming on every tick without adding schema).
// ---------------------------------------------------------------------------

const atRiskFired = new Set<number>();

// Open, non-terminal statuses whose SLA clock is still running.
const OPEN_STATUSES = ["NEW", "OPEN", "PENDING", "ON_HOLD"] as const;

/**
 * One sweep. Best-effort per ticket: a failure on one ticket never aborts the
 * rest of the batch. Returns a small summary for logging.
 */
export async function runSlaEscalation(): Promise<{ breached: number; atRisk: number }> {
  const tickets = await db.ticket.findMany({
    where: {
      status: { in: [...OPEN_STATUSES] },
      resolvedAt: null,
      OR: [{ resolveDueAt: { not: null } }, { dueAt: { not: null } }],
    },
    select: {
      id: true,
      status: true,
      resolvedAt: true,
      createdAt: true,
      resolveBreached: true,
      responseDueAt: true,
      resolveDueAt: true,
      dueAt: true,
      pendingSince: true,
      pausedMs: true,
      escalatedAt: true,
    },
  });

  const now = new Date();
  let breached = 0;
  let atRisk = 0;

  for (const t of tickets) {
    try {
      const { state } = slaSnapshot(t, now);

      if (state === "BREACHED") {
        if (t.escalatedAt) continue; // already escalated — never re-fire
        await db.ticket.update({ where: { id: t.id }, data: { escalatedAt: now } });
        atRiskFired.delete(t.id); // free memory; it can't be at-risk again
        await runAutomations("TICKET_SLA_BREACHED", t.id);
        breached++;
      } else if (state === "AT_RISK") {
        if (t.escalatedAt || atRiskFired.has(t.id)) continue; // once per process
        atRiskFired.add(t.id);
        await runAutomations("TICKET_SLA_AT_RISK", t.id);
        atRisk++;
      }
    } catch (e) {
      console.error(
        `[servio:sla-escalation] ticket ${t.id} error:`,
        e instanceof Error ? e.message : e,
      );
    }
  }

  return { breached, atRisk };
}
