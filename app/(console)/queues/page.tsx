import Link from "next/link";
import { Inbox, Ticket as TicketIcon } from "lucide-react";
import type { Metadata } from "next";
import type { Prisma } from "@prisma/client";
import { db } from "@/lib/db";
import { PageHeader, PageBody } from "@/components/page-header";
import { LinkButton } from "@/components/link-button";
import { ToneBadge } from "@/components/status-badge";
import { EmptyState } from "@/components/empty-state";
import {
  PRIORITY_META,
  OPEN_TICKET_STATUSES,
  metaFor,
  ticketRef,
} from "@/lib/constants";

export const metadata: Metadata = { title: "Queues" };
export const dynamic = "force-dynamic";

const MAX_CARDS = 10;

type BoardTicket = Prisma.TicketGetPayload<{
  include: { queue: true; assignee: true };
}>;

export default async function QueuesPage() {
  const [queues, tickets] = await Promise.all([
    db.queue.findMany({
      where: { isActive: true },
      orderBy: { order: "asc" },
    }),
    db.ticket.findMany({
      where: { status: { in: [...OPEN_TICKET_STATUSES] } },
      include: { queue: true, assignee: true },
      orderBy: [{ priority: "desc" }, { updatedAt: "desc" }],
    }),
  ]);

  const byQueue = new Map<string, BoardTicket[]>();
  const unassigned: BoardTicket[] = [];
  for (const t of tickets) {
    if (t.queueId) {
      const bucket = byQueue.get(t.queueId);
      if (bucket) bucket.push(t);
      else byQueue.set(t.queueId, [t]);
    } else {
      unassigned.push(t);
    }
  }

  type Column = {
    id: string;
    name: string;
    color: string;
    tickets: BoardTicket[];
  };

  const columns: Column[] = [
    ...queues.map((qq) => ({
      id: qq.id,
      name: qq.name,
      color: qq.color,
      tickets: byQueue.get(qq.id) ?? [],
    })),
    {
      id: "__unassigned__",
      name: "Unassigned queue",
      color: "#94a3b8",
      tickets: unassigned,
    },
  ];

  return (
    <>
      <PageHeader
        icon={Inbox}
        title="Queues"
        description="A live board of open tickets grouped by their queue."
      >
        <LinkButton href="/tickets">
          <TicketIcon className="size-4" /> All tickets
        </LinkButton>
      </PageHeader>

      <PageBody>
        {queues.length === 0 && unassigned.length === 0 ? (
          <EmptyState
            icon={Inbox}
            title="No active queues"
            description="Once queues are active and tickets are open, they will appear here as columns."
          >
            <LinkButton href="/tickets" size="sm">
              <TicketIcon className="size-4" /> Go to tickets
            </LinkButton>
          </EmptyState>
        ) : (
          <div className="flex gap-4 overflow-x-auto pb-2">
            {columns.map((col) => (
              <div
                key={col.id}
                className="flex min-w-[300px] max-w-[300px] flex-col rounded-xl border bg-card"
              >
                <div className="flex items-center justify-between gap-2 border-b px-4 py-3">
                  <div className="flex items-center gap-2">
                    <span
                      className="size-2.5 shrink-0 rounded-full"
                      style={{ backgroundColor: col.color }}
                    />
                    <span className="line-clamp-1 text-sm font-medium">
                      {col.name}
                    </span>
                  </div>
                  <span className="shrink-0 rounded-full bg-muted px-2 py-0.5 text-xs font-medium text-muted-foreground tabular-nums">
                    {col.tickets.length}
                  </span>
                </div>

                <div className="flex flex-col gap-2 p-3">
                  {col.tickets.length === 0 ? (
                    <p className="px-1 py-6 text-center text-xs text-muted-foreground">
                      No open tickets.
                    </p>
                  ) : (
                    col.tickets.slice(0, MAX_CARDS).map((t) => (
                      <Link
                        key={t.id}
                        href={`/tickets/${t.id}`}
                        className="group grid gap-2 rounded-lg border bg-background p-3 transition-colors hover:border-primary/40 hover:bg-accent/40"
                      >
                        <div className="flex items-center justify-between gap-2">
                          <span className="font-mono text-[11px] text-muted-foreground">
                            {ticketRef(t.id, t.type)}
                          </span>
                          <ToneBadge meta={metaFor(PRIORITY_META, t.priority)} dot />
                        </div>
                        <span className="line-clamp-2 text-sm font-medium leading-snug group-hover:text-primary">
                          {t.title}
                        </span>
                        {t.assignee ? (
                          <span className="text-xs text-muted-foreground">
                            {t.assignee.name?.split(" ")[0] ?? t.assignee.email}
                          </span>
                        ) : (
                          <span className="text-xs text-muted-foreground">
                            Unassigned
                          </span>
                        )}
                      </Link>
                    ))
                  )}

                  {col.tickets.length > MAX_CARDS ? (
                    <p className="px-1 pt-1 text-center text-xs text-muted-foreground">
                      +{col.tickets.length - MAX_CARDS} more
                    </p>
                  ) : null}
                </div>
              </div>
            ))}
          </div>
        )}
      </PageBody>
    </>
  );
}
