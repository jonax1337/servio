import { slaSnapshot, type SlaState } from "@/lib/sla";
import { SLA_STATE_META } from "@/lib/constants";
import { ToneBadge } from "@/components/status-badge";
import { metaFor } from "@/lib/constants";

type SlaTicket = {
  status: string;
  createdAt: Date;
  resolvedAt: Date | null;
  responseDueAt: Date | null;
  resolveDueAt: Date | null;
  dueAt: Date | null;
  pendingSince: Date | null;
  pausedMs: number;
  resolveBreached: boolean;
};

/**
 * Live SLA state badge (On track / At risk / Breached / Met / Paused).
 *
 * `state` (optional): a precomputed SLA state. Pass this from a server render
 * site that has loaded the SLA's business calendar (via `loadBusinessCalendar`
 * + `slaSnapshot(ticket, now, calendar)`) so the badge reflects BUSINESS-HOURS
 * SLA state and agrees with the escalation sweep. When omitted the badge falls
 * back to its own wall-clock (24/7) `slaSnapshot` — correct for SLAs without a
 * business calendar, but not calendar-aware.
 */
export function SlaBadge({
  ticket,
  state,
  className,
}: {
  ticket: SlaTicket;
  state?: SlaState;
  className?: string;
}) {
  const resolved = state ?? slaSnapshot(ticket).state;
  return <ToneBadge meta={metaFor(SLA_STATE_META, resolved)} className={className} />;
}
