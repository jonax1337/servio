import Link from "next/link";
import { Users, Plus, Mail } from "lucide-react";
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
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { GROUP_TYPE_META, GROUP_TYPES } from "@/lib/constants";

export const metadata: Metadata = { title: "Groups" };
export const dynamic = "force-dynamic";

export default async function GroupsPage({
  searchParams,
}: {
  searchParams: Promise<SearchParams>;
}) {
  const sp = await searchParams;
  const page = getPage(sp);
  const q = getParam(sp, "q");
  const type = getParam(sp, "type");

  const where: Prisma.GroupWhereInput = {};
  if (q) where.name = { contains: q };
  if (type && type !== "all") where.type = type;

  const [total, groups] = await Promise.all([
    db.group.count({ where }),
    db.group.findMany({
      where,
      include: { manager: true, _count: { select: { members: true } } },
      orderBy: [{ name: "asc" }],
      skip: (page - 1) * PAGE_SIZE,
      take: PAGE_SIZE,
    }),
  ]);

  const filters: FilterDef[] = [
    {
      key: "type",
      label: "Type",
      options: GROUP_TYPES.map((t) => ({ value: t, label: GROUP_TYPE_META[t].label })),
    },
  ];

  return (
    <>
      <PageHeader
        icon={Users}
        title="Groups"
        description="Teams, departments and vendors that own work across the service desk."
      >
        <LinkButton href="/groups/new">
          <Plus className="size-4" /> New group
        </LinkButton>
      </PageHeader>

      <PageBody className="grid gap-4">
        <ListToolbar filters={filters} searchPlaceholder="Search groups…" />

        {groups.length === 0 ? (
          <EmptyState
            icon={Users}
            title="No groups found"
            description="Try adjusting your filters, or create a new group to organise your teams."
          >
            <LinkButton href="/groups/new" size="sm">
              <Plus className="size-4" /> New group
            </LinkButton>
          </EmptyState>
        ) : (
          <div className="overflow-hidden rounded-xl border bg-card">
            <Table>
              <TableHeader>
                <TableRow className="hover:bg-transparent">
                  <TableHead>Name</TableHead>
                  <TableHead>Type</TableHead>
                  <TableHead className="hidden md:table-cell">Manager</TableHead>
                  <TableHead className="hidden lg:table-cell">Email</TableHead>
                  <TableHead className="text-right">Members</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {groups.map((g) => (
                  <TableRow key={g.id} className="group">
                    <TableCell className="max-w-[360px]">
                      <Link href={`/groups/${g.id}`} className="flex items-center gap-2.5">
                        <span
                          className="size-2.5 shrink-0 rounded-full"
                          style={{ backgroundColor: g.color }}
                        />
                        <span className="min-w-0">
                          <span className="line-clamp-1 font-medium group-hover:text-primary">
                            {g.name}
                          </span>
                          {g.description ? (
                            <span className="line-clamp-1 text-xs text-muted-foreground">
                              {g.description}
                            </span>
                          ) : null}
                        </span>
                      </Link>
                    </TableCell>
                    <TableCell>
                      <StatusBadge map={GROUP_TYPE_META} value={g.type} dot />
                    </TableCell>
                    <TableCell className="hidden md:table-cell text-sm text-muted-foreground">
                      {g.manager ? (g.manager.name ?? g.manager.email) : "—"}
                    </TableCell>
                    <TableCell className="hidden lg:table-cell text-sm text-muted-foreground">
                      {g.email ? (
                        <span className="inline-flex items-center gap-1.5">
                          <Mail className="size-3.5" /> {g.email}
                        </span>
                      ) : (
                        "—"
                      )}
                    </TableCell>
                    <TableCell className="text-right tabular-nums">
                      {g._count.members}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        )}

        <PaginationBar
          pathname="/groups"
          searchParams={sp}
          page={page}
          pageSize={PAGE_SIZE}
          total={total}
        />
      </PageBody>
    </>
  );
}
