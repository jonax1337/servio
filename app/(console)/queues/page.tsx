import Link from "next/link";
import type { Metadata } from "next";
import { Inbox } from "lucide-react";
import { db } from "@/lib/db";
import { PageHeader, PageBody } from "@/components/page-header";
import { LinkButton } from "@/components/link-button";
import { EmptyState } from "@/components/empty-state";
import { ToneBadge } from "@/components/status-badge";
import { PRIORITY_META, OPEN_TICKET_STATUSES, metaFor, ticketRef } from "@/lib/constants";

export const metadata: Metadata = { title: "Team board" };
export const dynamic = "force-dynamic";

export default async function BoardPage() {
  const [groups, tickets] = await Promise.all([
    db.group.findMany({ where: { type: { not: "VENDOR" } }, orderBy: { name: "asc" } }),
    db.ticket.findMany({
      where: { status: { in: [...OPEN_TICKET_STATUSES] } },
      include: { assignee: true },
      orderBy: [{ priority: "desc" }, { updatedAt: "desc" }],
    }),
  ]);

  const byGroup = new Map<string, typeof tickets>();
  for (const t of tickets) {
    const key = t.groupId ?? "__none__";
    if (!byGroup.has(key)) byGroup.set(key, []);
    byGroup.get(key)!.push(t);
  }

  const columns = [
    ...groups.map((g) => ({ id: g.id, name: g.name, color: g.color, tickets: byGroup.get(g.id) ?? [] })),
    { id: "__none__", name: "Unassigned", color: "#64748b", tickets: byGroup.get("__none__") ?? [] },
  ].filter((c) => c.id !== "__none__" || c.tickets.length > 0);

  return (
    <>
      <PageHeader
        icon={Inbox}
        title="Team board"
        description="Open work grouped by the team that owns it. Assign a ticket to a team to move it here."
      >
        <LinkButton href="/tickets">All tickets</LinkButton>
      </PageHeader>

      <PageBody>
        {groups.length === 0 ? (
          <EmptyState icon={Inbox} title="No teams yet" description="Create a team to start routing work." />
        ) : (
          <div className="flex gap-4 overflow-x-auto pb-2">
            {columns.map((col) => (
              <div key={col.id} className="flex min-w-[300px] max-w-[320px] flex-col rounded-xl border bg-card">
                <div className="flex items-center gap-2 border-b px-3 py-2.5">
                  <span className="size-2.5 rounded-full" style={{ background: col.color }} />
                  <span className="font-medium">{col.name}</span>
                  <span className="ml-auto rounded-full bg-muted px-2 text-xs tabular-nums text-muted-foreground">
                    {col.tickets.length}
                  </span>
                </div>
                <div className="grid gap-2 p-2">
                  {col.tickets.slice(0, 12).map((t) => (
                    <Link
                      key={t.id}
                      href={`/tickets/${t.id}`}
                      className="grid gap-1.5 rounded-lg border bg-background p-2.5 transition-colors hover:border-primary/40"
                    >
                      <div className="flex items-center gap-2">
                        <span className="font-mono text-[11px] text-muted-foreground">{ticketRef(t.id, t.type)}</span>
                        <ToneBadge meta={metaFor(PRIORITY_META, t.priority)} className="ml-auto" />
                      </div>
                      <span className="line-clamp-2 text-sm font-medium">{t.title}</span>
                      <span className="text-xs text-muted-foreground">
                        {t.assignee ? (t.assignee.name?.split(" ")[0] ?? t.assignee.email) : "Unassigned"}
                      </span>
                    </Link>
                  ))}
                  {col.tickets.length === 0 ? (
                    <p className="px-1 py-4 text-center text-xs text-muted-foreground">No open tickets</p>
                  ) : null}
                  {col.tickets.length > 12 ? (
                    <p className="px-1 pb-1 text-center text-xs text-muted-foreground">+{col.tickets.length - 12} more</p>
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
