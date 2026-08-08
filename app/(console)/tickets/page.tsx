import Link from "next/link";
import { Ticket as TicketIcon, Plus } from "lucide-react";
import type { Metadata } from "next";
import type { Prisma } from "@prisma/client";
import { db } from "@/lib/db";
import { getFormOptions } from "@/lib/data/options";
import { getParam, getPage, PAGE_SIZE, type SearchParams } from "@/lib/query";
import { PageHeader, PageBody } from "@/components/page-header";
import { LinkButton } from "@/components/link-button";
import { ListToolbar, type FilterDef } from "@/components/list-toolbar";
import { PaginationBar } from "@/components/pagination-bar";
import { StatusBadge, VipBadge } from "@/components/status-badge";
import { EmptyState } from "@/components/empty-state";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  TICKET_STATUS_META,
  PRIORITY_META,
  TICKET_TYPE_META,
  TICKET_STATUSES,
  PRIORITIES,
  TICKET_TYPES,
  OPEN_TICKET_STATUSES,
  ticketRef,
} from "@/lib/constants";
import { formatDistanceToNow } from "date-fns";

export const metadata: Metadata = { title: "Tickets" };
export const dynamic = "force-dynamic";

function initials(s: string) {
  return s.split(" ").map((p) => p[0]).slice(0, 2).join("").toUpperCase();
}

export default async function TicketsPage({
  searchParams,
}: {
  searchParams: Promise<SearchParams>;
}) {
  const sp = await searchParams;
  const page = getPage(sp);
  const q = getParam(sp, "q");
  const status = getParam(sp, "status");
  const priority = getParam(sp, "priority");
  const type = getParam(sp, "type");
  const group = getParam(sp, "group");
  const assignee = getParam(sp, "assignee");
  const opts = await getFormOptions();

  const where: Prisma.TicketWhereInput = {};
  if (q) where.title = { contains: q };
  if (status === "open") where.status = { in: [...OPEN_TICKET_STATUSES] };
  else if (status && status !== "all") where.status = status;
  if (priority && priority !== "all") where.priority = priority;
  if (type && type !== "all") where.type = type;
  if (group && group !== "all") where.groupId = group;
  if (assignee === "unassigned") where.assigneeId = null;
  else if (assignee && assignee !== "all") where.assigneeId = assignee;

  const [total, tickets] = await Promise.all([
    db.ticket.count({ where }),
    db.ticket.findMany({
      where,
      include: { assignee: true, requester: true, group: true, category: true },
      orderBy: [{ updatedAt: "desc" }],
      skip: (page - 1) * PAGE_SIZE,
      take: PAGE_SIZE,
    }),
  ]);

  const filters: FilterDef[] = [
    {
      key: "status",
      label: "Status",
      options: [
        { value: "open", label: "Open (active)" },
        ...TICKET_STATUSES.map((s) => ({ value: s, label: TICKET_STATUS_META[s].label })),
      ],
    },
    { key: "priority", label: "Priority", options: PRIORITIES.map((p) => ({ value: p, label: PRIORITY_META[p].label })) },
    { key: "type", label: "Type", options: TICKET_TYPES.map((t) => ({ value: t, label: TICKET_TYPE_META[t].label })) },
    { key: "group", label: "Team", options: opts.groups.map((g) => ({ value: g.id, label: g.name })) },
    {
      key: "assignee",
      label: "Assignee",
      options: [
        { value: "unassigned", label: "Unassigned" },
        ...opts.agents.map((a) => ({ value: a.id, label: a.name ?? a.email })),
      ],
    },
  ];

  return (
    <>
      <PageHeader
        icon={TicketIcon}
        title="Tickets"
        description="Incidents and service requests across all teams."
      >
        <LinkButton href="/tickets/new">
          <Plus className="size-4" /> New ticket
        </LinkButton>
      </PageHeader>

      <PageBody className="grid gap-4">
        <ListToolbar filters={filters} searchPlaceholder="Search tickets…" />

        {tickets.length === 0 ? (
          <EmptyState
            icon={TicketIcon}
            title="No tickets found"
            description="Try adjusting your filters, or create a new ticket to get started."
          >
            <LinkButton href="/tickets/new" size="sm">
              <Plus className="size-4" /> New ticket
            </LinkButton>
          </EmptyState>
        ) : (
          <div className="overflow-hidden rounded-xl border bg-card">
            <Table>
              <TableHeader>
                <TableRow className="hover:bg-transparent">
                  <TableHead className="w-[92px]">Ref</TableHead>
                  <TableHead>Subject</TableHead>
                  <TableHead className="hidden lg:table-cell">Requester</TableHead>
                  <TableHead>Priority</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead className="hidden md:table-cell">Assignee</TableHead>
                  <TableHead className="hidden xl:table-cell text-right">Updated</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {tickets.map((t) => (
                  <TableRow key={t.id} className="group">
                    <TableCell className="font-mono text-xs text-muted-foreground">
                      {ticketRef(t.id, t.type)}
                    </TableCell>
                    <TableCell className="max-w-[420px]">
                      <Link href={`/tickets/${t.id}`} className="block">
                        <span className="line-clamp-1 font-medium group-hover:text-primary">
                          {t.title}
                        </span>
                        {t.category ? (
                          <span className="text-xs text-muted-foreground">{t.category.name}</span>
                        ) : null}
                      </Link>
                    </TableCell>
                    <TableCell className="hidden lg:table-cell text-sm text-muted-foreground">
                      <span className="inline-flex items-center gap-1.5">
                        {t.requester.isVip ? <VipBadge label={false} /> : null}
                        {t.requester.name ?? t.requester.email}
                      </span>
                    </TableCell>
                    <TableCell>
                      <StatusBadge map={PRIORITY_META} value={t.priority} dot />
                    </TableCell>
                    <TableCell>
                      <StatusBadge map={TICKET_STATUS_META} value={t.status} />
                    </TableCell>
                    <TableCell className="hidden md:table-cell">
                      {t.assignee ? (
                        <div className="flex items-center gap-2">
                          <Avatar className="size-6">
                            <AvatarFallback className="text-[10px]">
                              {initials(t.assignee.name ?? t.assignee.email)}
                            </AvatarFallback>
                          </Avatar>
                          <span className="text-sm text-muted-foreground">
                            {t.assignee.name?.split(" ")[0] ?? t.assignee.email}
                          </span>
                        </div>
                      ) : (
                        <span className="text-xs text-muted-foreground">—</span>
                      )}
                    </TableCell>
                    <TableCell className="hidden xl:table-cell text-right text-xs text-muted-foreground">
                      {formatDistanceToNow(t.updatedAt, { addSuffix: true })}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        )}

        <PaginationBar
          pathname="/tickets"
          searchParams={sp}
          page={page}
          pageSize={PAGE_SIZE}
          total={total}
        />
      </PageBody>
    </>
  );
}
