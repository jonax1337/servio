import { slaSnapshot } from "@/lib/sla";
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

/** Live SLA state badge (On track / At risk / Breached / Met / Paused). */
export function SlaBadge({ ticket, className }: { ticket: SlaTicket; className?: string }) {
  const { state } = slaSnapshot(ticket);
  return <ToneBadge meta={metaFor(SLA_STATE_META, state)} className={className} />;
}
