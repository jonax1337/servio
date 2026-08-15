import { db } from "@/lib/db";

// ---------------------------------------------------------------------------
// SLA clock. Deadlines are stored as absolute timestamps on the ticket and
// shifted forward whenever the ticket is paused (PENDING/ON_HOLD), so elapsed
// paused time never counts against the SLA. Business-hours calendars are a
// later refinement — today the clock runs on wall-clock time.
// ---------------------------------------------------------------------------

export type SlaState = "ON_TRACK" | "AT_RISK" | "BREACHED" | "MET" | "PAUSED" | "NONE";

type SlaInput = { slaId?: string | null; serviceId?: string | null; priority?: string | null };

/** Resolve which SLA applies: explicit → service → priority match. */
export async function resolveSla(input: SlaInput) {
  if (input.slaId) {
    const sla = await db.sLA.findUnique({ where: { id: input.slaId } });
    if (sla && sla.isActive) return sla;
  }
  if (input.serviceId) {
    const service = await db.service.findUnique({
      where: { id: input.serviceId },
      include: { sla: true },
    });
    if (service?.sla?.isActive) return service.sla;
  }
  if (input.priority) {
    const byPriority = await db.sLA.findFirst({
      where: { priority: input.priority, isActive: true },
      orderBy: { name: "asc" }, // deterministic when several share a priority
    });
    if (byPriority) return byPriority;
  }
  return null;
}

/**
 * Data to spread into `ticket.create` — resolves the SLA and stamps the
 * response/resolve deadlines. Returns `{}` when no SLA applies.
 */
export async function slaCreateData(input: SlaInput, from: Date = new Date()) {
  const sla = await resolveSla(input);
  if (!sla) return {} as Record<string, never>;
  const responseDueAt = new Date(from.getTime() + sla.responseMins * 60_000);
  const resolveDueAt = new Date(from.getTime() + sla.resolveMins * 60_000);
  return { slaId: sla.id, responseDueAt, resolveDueAt, dueAt: resolveDueAt };
}

type ClockTicket = {
  responseDueAt: Date | null;
  resolveDueAt: Date | null;
  dueAt: Date | null;
  pendingSince: Date | null;
  pausedMs: number;
};

/** Fields to write when a ticket enters a paused (PENDING/ON_HOLD) state. */
export function pauseData(ticket: { pendingSince: Date | null }, now: Date = new Date()) {
  if (ticket.pendingSince) return {}; // already paused — don't reset the anchor
  return { pendingSince: now };
}

/** Fields to write when a ticket leaves a paused state: shift deadlines forward. */
export function resumeData(ticket: ClockTicket, now: Date = new Date()) {
  if (!ticket.pendingSince) return {};
  const delta = Math.max(0, now.getTime() - ticket.pendingSince.getTime());
  const shift = (d: Date | null) => (d ? new Date(d.getTime() + delta) : d);
  return {
    pendingSince: null,
    pausedMs: ticket.pausedMs + delta,
    responseDueAt: shift(ticket.responseDueAt),
    resolveDueAt: shift(ticket.resolveDueAt),
    dueAt: shift(ticket.dueAt),
  };
}

/** Stamp the first-response clock (called on the first public agent reply). */
export function firstResponseData(ticket: { responseDueAt: Date | null }, now: Date = new Date()) {
  return {
    firstResponseAt: now,
    responseBreached: ticket.responseDueAt ? now > ticket.responseDueAt : false,
  };
}

/** Whether the resolve SLA was breached, given the resolution time. */
export function resolveBreachData(ticket: { resolveDueAt: Date | null }, resolvedAt: Date) {
  return { resolveBreached: ticket.resolveDueAt ? resolvedAt > ticket.resolveDueAt : false };
}

/**
 * The side-effect fields to write when a ticket's status changes to `value`
 * (everything except the `status` column itself): SLA pause on entering
 * PENDING/ON_HOLD, resume+deadline-shift on leaving, resolve/close stamping,
 * and reopen clearing. Shared by the console (updateTicketField) and the
 * automation engine so both keep the SLA clock and resolution stamps in sync.
 */
export function statusChangeData(
  current: ClockTicket & {
    status: string;
    resolutionCode?: string | null;
    resolutionNote?: string | null;
  },
  value: string,
  now: Date = new Date(),
): Record<string, unknown> {
  const patch: Record<string, unknown> = {};
  const wasPending = current.status === "PENDING" || current.status === "ON_HOLD";
  const willPending = value === "PENDING" || value === "ON_HOLD";

  if (willPending && !wasPending) Object.assign(patch, pauseData(current, now));
  let effResolveDueAt = current.resolveDueAt;
  if (!willPending && wasPending) {
    const resumed = resumeData(current, now);
    Object.assign(patch, resumed);
    effResolveDueAt = resumed.resolveDueAt ?? current.resolveDueAt;
  }

  if (value === "RESOLVED") {
    patch.resolvedAt = now;
    patch.resolveBreached = effResolveDueAt ? now > effResolveDueAt : false;
  }
  if (value === "CLOSED") patch.closedAt = now;
  if (value === "OPEN" || value === "NEW") {
    patch.resolvedAt = null;
    patch.closedAt = null;
    patch.resolutionCode = null;
    patch.resolutionNote = null;
    patch.resolveBreached = false;
  }
  // Leaving a pending state clears its reason.
  if (!willPending) {
    patch.pendingReason = null;
    patch.pendingNote = null;
  }
  return patch;
}

const AT_RISK_FRACTION = 0.2; // last 20% of the window → "at risk"

/** Live SLA state for display. `resolvedAt`/status decide terminal states. */
export function slaSnapshot(
  ticket: ClockTicket & {
    status: string;
    resolvedAt: Date | null;
    createdAt: Date;
    resolveBreached: boolean;
  },
  now: Date = new Date(),
): { state: SlaState; dueAt: Date | null } {
  const dueAt = ticket.resolveDueAt ?? ticket.dueAt;
  if (!dueAt) return { state: "NONE", dueAt: null };

  if (ticket.resolvedAt || ["RESOLVED", "CLOSED"].includes(ticket.status)) {
    return { state: ticket.resolveBreached ? "BREACHED" : "MET", dueAt };
  }
  if (ticket.pendingSince || ["PENDING", "ON_HOLD"].includes(ticket.status)) {
    return { state: "PAUSED", dueAt };
  }
  if (now > dueAt) return { state: "BREACHED", dueAt };

  // Exclude already-banked paused time from the window so "at risk" reflects the
  // true active-time budget, not wall-clock inflated by past pauses.
  const total = dueAt.getTime() - ticket.createdAt.getTime() - ticket.pausedMs;
  const remaining = dueAt.getTime() - now.getTime();
  if (total > 0 && remaining <= total * AT_RISK_FRACTION) return { state: "AT_RISK", dueAt };
  return { state: "ON_TRACK", dueAt };
}
