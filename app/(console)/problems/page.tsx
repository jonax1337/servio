import Link from "next/link";
import { AlertTriangle, Plus } from "lucide-react";
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
  PROBLEM_STATUS_META,
  PRIORITY_META,
  PROBLEM_STATUSES,
  PRIORITIES,
  problemRef,
} from "@/lib/constants";
import { formatDistanceToNow } from "date-fns";

export const metadata: Metadata = { title: "Problems" };
export const dynamic = "force-dynamic";

function initials(s: string) {
  return s.split(" ").map((p) => p[0]).slice(0, 2).join("").toUpperCase();
}

export default async function ProblemsPage({
  searchParams,
}: {
  searchParams: Promise<SearchParams>;
}) {
  const sp = await searchParams;
  const page = getPage(sp);
  const q = getParam(sp, "q");
  const status = getParam(sp, "status");
  const priority = getParam(sp, "priority");

  const where: Prisma.ProblemWhereInput = {};
  if (q) where.title = { contains: q };
  if (status && status !== "all") where.status = status;
  if (priority && priority !== "all") where.priority = priority;

  const [total, problems] = await Promise.all([
    db.problem.count({ where }),
    db.problem.findMany({
      where,
      include: {
        assignee: true,
        category: true,
        _count: { select: { tickets: true } },
      },
      orderBy: [{ createdAt: "desc" }],
      skip: (page - 1) * PAGE_SIZE,
      take: PAGE_SIZE,
    }),
  ]);

  const filters: FilterDef[] = [
    { key: "status", label: "Status", options: PROBLEM_STATUSES.map((s) => ({ value: s, label: PROBLEM_STATUS_META[s].label })) },
    { key: "priority", label: "Priority", options: PRIORITIES.map((p) => ({ value: p, label: PRIORITY_META[p].label })) },
  ];

  return (
    <>
      <PageHeader
        icon={AlertTriangle}
        title="Problems"
        description="Root-cause analysis for recurring incidents and known errors."
      >
        <LinkButton href="/problems/new">
          <Plus className="size-4" /> New problem
        </LinkButton>
      </PageHeader>

      <PageBody className="grid gap-4">
        <ListToolbar filters={filters} searchPlaceholder="Search problems…" />

        {problems.length === 0 ? (
          <EmptyState
            icon={AlertTriangle}
            title="No problems found"
            description="Try adjusting your filters, or create a new problem record to get started."
          >
            <LinkButton href="/problems/new" size="sm">
              <Plus className="size-4" /> New problem
            </LinkButton>
          </EmptyState>
        ) : (
          <div className="overflow-hidden rounded-xl border bg-card">
            <Table>
              <TableHeader>
                <TableRow className="hover:bg-transparent">
                  <TableHead className="w-[92px]">Ref</TableHead>
                  <TableHead>Title</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Priority</TableHead>
                  <TableHead className="hidden md:table-cell">Assignee</TableHead>
                  <TableHead className="hidden lg:table-cell text-right">Incidents</TableHead>
                  <TableHead className="hidden xl:table-cell text-right">Created</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {problems.map((p) => (
                  <TableRow key={p.id} className="group">
                    <TableCell className="font-mono text-xs text-muted-foreground">
                      {problemRef(p.id)}
                    </TableCell>
                    <TableCell className="max-w-[420px]">
                      <Link href={`/problems/${p.id}`} className="block">
                        <span className="line-clamp-1 font-medium group-hover:text-primary">
                          {p.title}
                        </span>
                        {p.category ? (
                          <span className="text-xs text-muted-foreground">{p.category.name}</span>
                        ) : null}
                      </Link>
                    </TableCell>
                    <TableCell>
                      <StatusBadge map={PROBLEM_STATUS_META} value={p.status} />
                    </TableCell>
                    <TableCell>
                      <StatusBadge map={PRIORITY_META} value={p.priority} dot />
                    </TableCell>
                    <TableCell className="hidden md:table-cell">
                      {p.assignee ? (
                        <div className="flex items-center gap-2">
                          <Avatar className="size-6">
                            <AvatarFallback className="text-[10px]">
                              {initials(p.assignee.name ?? p.assignee.email)}
                            </AvatarFallback>
                          </Avatar>
                          <span className="text-sm text-muted-foreground">
                            {p.assignee.name?.split(" ")[0] ?? p.assignee.email}
                          </span>
                        </div>
                      ) : (
                        <span className="text-xs text-muted-foreground">—</span>
                      )}
                    </TableCell>
                    <TableCell className="hidden lg:table-cell text-right text-sm tabular-nums text-muted-foreground">
                      {p._count.tickets}
                    </TableCell>
                    <TableCell className="hidden xl:table-cell text-right text-xs text-muted-foreground">
                      {formatDistanceToNow(p.createdAt, { addSuffix: true })}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        )}

        <PaginationBar
          pathname="/problems"
          searchParams={sp}
          page={page}
          pageSize={PAGE_SIZE}
          total={total}
        />
      </PageBody>
    </>
  );
}
