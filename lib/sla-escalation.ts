import { db } from "@/lib/db";
import { slaSnapshot, firstResponseBreached } from "@/lib/sla";
import { runAutomations } from "@/lib/automations";

// ---------------------------------------------------------------------------
// SLA escalation sweep. Periodically scans open, unresolved tickets that carry
// an SLA deadline, computes the live SLA state, and fires the SLA automation
// triggers:
//   • first time the RESOLVE SLA is BREACHED (and escalatedAt is still null) →
//     stamp escalatedAt=now and run TICKET_SLA_BREACHED.
//   • first time the FIRST-RESPONSE SLA is breached (no first response yet and
//     responseBreached still false) → stamp responseBreached=true and run
//     TICKET_SLA_BREACHED.
//   • when a ticket is AT_RISK (and not yet escalated) → run TICKET_SLA_AT_RISK,
//     but do NOT stamp escalatedAt (at-risk fires before breach).
//
// Idempotency is DURABLE — every "fire once" decision is a conditional
// updateMany() guarded by an isNull/false marker column, so the automation runs
// at most once even across process restarts or with several instances sweeping
// concurrently (whoever wins the update owns the notification):
//   • resolve breach   → Ticket.escalatedAt
//   • response breach   → Ticket.responseBreached
//   • at-risk           → Ticket.slaAtRiskNotifiedAt
// ---------------------------------------------------------------------------

// Open, non-terminal statuses whose SLA clock is still running.
const OPEN_STATUSES = ["NEW", "OPEN", "PENDING", "ON_HOLD"] as const;

/**
 * One sweep. Best-effort per ticket: a failure on one ticket never aborts the
 * rest of the batch. Returns a small summary for logging.
 */
export async function runSlaEscalation(): Promise<{
  breached: number;
  responseBreached: number;
  atRisk: number;
}> {
  const tickets = await db.ticket.findMany({
    where: {
      status: { in: [...OPEN_STATUSES] },
      resolvedAt: null,
      OR: [
        { resolveDueAt: { not: null } },
        { dueAt: { not: null } },
        { responseDueAt: { not: null } },
      ],
    },
    select: {
      id: true,
      status: true,
      resolvedAt: true,
      createdAt: true,
      resolveBreached: true,
      responseDueAt: true,
      responseBreached: true,
      firstResponseAt: true,
      resolveDueAt: true,
      dueAt: true,
      pendingSince: true,
      pausedMs: true,
      escalatedAt: true,
      slaAtRiskNotifiedAt: true,
    },
  });

  const now = new Date();
  let breached = 0;
  let responseBreached = 0;
  let atRisk = 0;

  for (const t of tickets) {
    try {
      // First-response breach is independent of the resolve-SLA state below: a
      // ticket can breach its response SLA while its resolve SLA is still on
      // track. Fire it once via a conditional updateMany guarded by the durable
      // responseBreached marker (isNull-equivalent for a boolean).
      if (firstResponseBreached(t, now)) {
        const res = await db.ticket.updateMany({
          where: { id: t.id, firstResponseAt: null, responseBreached: false },
          data: { responseBreached: true },
        });
        if (res.count > 0) {
          await runAutomations("TICKET_SLA_BREACHED", t.id);
          responseBreached++;
        }
      }

      const { state } = slaSnapshot(t, now);

      if (state === "BREACHED") {
        // Conditional updateMany guarded by escalatedAt=null → at-most-once even
        // across restarts/instances (the writer whose update lands owns it).
        const res = await db.ticket.updateMany({
          where: { id: t.id, escalatedAt: null },
          data: { escalatedAt: now },
        });
        if (res.count > 0) {
          await runAutomations("TICKET_SLA_BREACHED", t.id);
          breached++;
        }
      } else if (state === "AT_RISK") {
        if (t.escalatedAt) continue; // breach escalation supersedes at-risk
        // Durable once-only guard: slaAtRiskNotifiedAt isNull.
        const res = await db.ticket.updateMany({
          where: { id: t.id, slaAtRiskNotifiedAt: null },
          data: { slaAtRiskNotifiedAt: now },
        });
        if (res.count > 0) {
          await runAutomations("TICKET_SLA_AT_RISK", t.id);
          atRisk++;
        }
      }
    } catch (e) {
      console.error(
        `[servio:sla-escalation] ticket ${t.id} error:`,
        e instanceof Error ? e.message : e,
      );
    }
  }

  return { breached, responseBreached, atRisk };
}
