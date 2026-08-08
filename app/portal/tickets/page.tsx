import Link from "next/link";
import type { Metadata } from "next";
import { Ticket as TicketIcon, Plus } from "lucide-react";
import { db } from "@/lib/db";
import { requireUser } from "@/lib/session";
import { LinkButton } from "@/components/link-button";
import { StatusBadge } from "@/components/status-badge";
import { EmptyState } from "@/components/empty-state";
import { Card, CardContent } from "@/components/ui/card";
import { TICKET_STATUS_META, PRIORITY_META, TICKET_TYPE_META, ticketRef } from "@/lib/constants";
import { formatDistanceToNow } from "date-fns";

export const metadata: Metadata = { title: "My tickets" };
export const dynamic = "force-dynamic";

export default async function PortalTickets() {
  const me = await requireUser();
  const tickets = await db.ticket.findMany({
    where: { requesterId: me.id },
    orderBy: { updatedAt: "desc" },
  });

  return (
    <div className="grid gap-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="font-display text-2xl font-semibold tracking-tight">My tickets</h1>
          <p className="text-sm text-muted-foreground">Track the status of everything you&apos;ve submitted.</p>
        </div>
        <LinkButton href="/portal/new"><Plus className="size-4" /> New request</LinkButton>
      </div>

      {tickets.length === 0 ? (
        <EmptyState icon={TicketIcon} title="No tickets yet" description="When you submit a request, it will show up here.">
          <LinkButton href="/portal/new" size="sm">New request</LinkButton>
        </EmptyState>
      ) : (
        <Card>
          <CardContent className="divide-y p-0">
            {tickets.map((t) => (
              <Link key={t.id} href={`/portal/tickets/${t.id}`} className="flex flex-wrap items-center gap-3 p-4 transition-colors hover:bg-muted/50">
                <span className="w-16 shrink-0 font-mono text-xs text-muted-foreground">{ticketRef(t.id, t.type)}</span>
                <span className="min-w-0 flex-1 truncate font-medium">{t.title}</span>
                <StatusBadge map={TICKET_TYPE_META} value={t.type} dot />
                <StatusBadge map={PRIORITY_META} value={t.priority} dot />
                <StatusBadge map={TICKET_STATUS_META} value={t.status} />
                <span className="shrink-0 text-xs text-muted-foreground">
                  {formatDistanceToNow(t.updatedAt, { addSuffix: true })}
                </span>
              </Link>
            ))}
          </CardContent>
        </Card>
      )}
    </div>
  );
}
