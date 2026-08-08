import Link from "next/link";
import { GitPullRequestArrow, Plus } from "lucide-react";
import type { Metadata } from "next";
import type { Prisma } from "@prisma/client";
import { db } from "@/lib/db";
import { getParam, getPage, PAGE_SIZE, type SearchParams } from "@/lib/query";
import { PageHeader, PageBody } from "@/components/page-header";
import { LinkButton } from "@/components/link-button";
import { ListToolbar, type FilterDef } from "@/components/list-toolbar";
import { PaginationBar } from "@/components/pagination-bar";
import { StatusBadge } from "@/components/status-badge";
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
  CHANGE_STATUS_META,
  CHANGE_TYPE_META,
  RISK_META,
  CHANGE_STATUSES,
  CHANGE_TYPES,
  RISKS,
  changeRef,
} from "@/lib/constants";
import { format } from "date-fns";

export const metadata: Metadata = { title: "Changes" };
export const dynamic = "force-dynamic";

function initials(s: string) {
  return s.split(" ").map((p) => p[0]).slice(0, 2).join("").toUpperCase();
}

export default async function ChangesPage({
  searchParams,
}: {
  searchParams: Promise<SearchParams>;
}) {
  const sp = await searchParams;
  const page = getPage(sp);
  const q = getParam(sp, "q");
  const status = getParam(sp, "status");
  const type = getParam(sp, "type");
  const risk = getParam(sp, "risk");

  const where: Prisma.ChangeWhereInput = {};
  if (q) where.title = { contains: q };
  if (status && status !== "all") where.status = status;
  if (type && type !== "all") where.type = type;
  if (risk && risk !== "all") where.risk = risk;

  const [total, changes] = await Promise.all([
    db.change.count({ where }),
    db.change.findMany({
      where,
      include: { assignee: true, category: true },
      orderBy: [{ updatedAt: "desc" }],
      skip: (page - 1) * PAGE_SIZE,
      take: PAGE_SIZE,
    }),
  ]);

  const filters: FilterDef[] = [
    {
      key: "status",
      label: "Status",
      options: CHANGE_STATUSES.map((s) => ({ value: s, label: CHANGE_STATUS_META[s].label })),
    },
    {
      key: "type",
      label: "Type",
      options: CHANGE_TYPES.map((t) => ({ value: t, label: CHANGE_TYPE_META[t].label })),
    },
    {
      key: "risk",
      label: "Risk",
      options: RISKS.map((r) => ({ value: r, label: RISK_META[r].label })),
    },
  ];

  return (
    <>
      <PageHeader
        icon={GitPullRequestArrow}
        title="Changes"
        description="Standard, normal and emergency changes moving through approval."
      >
        <LinkButton href="/changes/new">
          <Plus className="size-4" /> New change
        </LinkButton>
      </PageHeader>

      <PageBody className="grid gap-4">
        <ListToolbar filters={filters} searchPlaceholder="Search changes…" />

        {changes.length === 0 ? (
          <EmptyState
            icon={GitPullRequestArrow}
            title="No changes found"
            description="Try adjusting your filters, or raise a new change to get started."
          >
            <LinkButton href="/changes/new" size="sm">
              <Plus className="size-4" /> New change
            </LinkButton>
          </EmptyState>
        ) : (
          <div className="overflow-hidden rounded-xl border bg-card">
            <Table>
              <TableHeader>
                <TableRow className="hover:bg-transparent">
                  <TableHead className="w-[96px]">Ref</TableHead>
                  <TableHead>Title</TableHead>
                  <TableHead>Type</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Risk</TableHead>
                  <TableHead className="hidden lg:table-cell text-right">Planned start</TableHead>
                  <TableHead className="hidden md:table-cell">Assignee</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {changes.map((c) => (
                  <TableRow key={c.id} className="group">
                    <TableCell className="font-mono text-xs text-muted-foreground">
                      {changeRef(c.id)}
                    </TableCell>
                    <TableCell className="max-w-[420px]">
                      <Link href={`/changes/${c.id}`} className="block">
                        <span className="line-clamp-1 font-medium group-hover:text-primary">
                          {c.title}
                        </span>
                        {c.category ? (
                          <span className="text-xs text-muted-foreground">{c.category.name}</span>
                        ) : null}
                      </Link>
                    </TableCell>
                    <TableCell>
                      <StatusBadge map={CHANGE_TYPE_META} value={c.type} dot />
                    </TableCell>
                    <TableCell>
                      <StatusBadge map={CHANGE_STATUS_META} value={c.status} />
                    </TableCell>
                    <TableCell>
                      <StatusBadge map={RISK_META} value={c.risk} dot />
                    </TableCell>
                    <TableCell className="hidden lg:table-cell text-right text-xs text-muted-foreground tabular-nums">
                      {c.plannedStart ? format(c.plannedStart, "PP") : "—"}
                    </TableCell>
                    <TableCell className="hidden md:table-cell">
                      {c.assignee ? (
                        <div className="flex items-center gap-2">
                          <Avatar className="size-6">
                            <AvatarFallback className="text-[10px]">
                              {initials(c.assignee.name ?? c.assignee.email)}
                            </AvatarFallback>
                          </Avatar>
                          <span className="text-sm text-muted-foreground">
                            {c.assignee.name?.split(" ")[0] ?? c.assignee.email}
                          </span>
                        </div>
                      ) : (
                        <span className="text-xs text-muted-foreground">—</span>
                      )}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        )}

        <PaginationBar
          pathname="/changes"
          searchParams={sp}
          page={page}
          pageSize={PAGE_SIZE}
          total={total}
        />
      </PageBody>
    </>
  );
}
