import Link from "next/link";
import { Users } from "lucide-react";
import type { Metadata } from "next";
import type { Prisma } from "@prisma/client";
import { db } from "@/lib/db";
import { getParam, getPage, PAGE_SIZE, type SearchParams } from "@/lib/query";
import { PageHeader, PageBody } from "@/components/page-header";
import { ListToolbar, type FilterDef } from "@/components/list-toolbar";
import { PaginationBar } from "@/components/pagination-bar";
import { StatusBadge, VipBadge } from "@/components/status-badge";
import { EmptyState } from "@/components/empty-state";
import { UserAvatar } from "@/components/user-avatar";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { ROLE_META, ROLES } from "@/lib/constants";
import { formatDistanceToNow } from "date-fns";

export const metadata: Metadata = { title: "People" };
export const dynamic = "force-dynamic";

export default async function PeoplePage({
  searchParams,
}: {
  searchParams: Promise<SearchParams>;
}) {
  const sp = await searchParams;
  const page = getPage(sp);
  const q = getParam(sp, "q");
  const role = getParam(sp, "role");
  const active = getParam(sp, "active");

  const where: Prisma.UserWhereInput = {};
  if (q) where.OR = [{ name: { contains: q } }, { email: { contains: q } }];
  if (role && role !== "all") where.role = role;
  if (active === "true") where.isActive = true;
  else if (active === "false") where.isActive = false;

  const [total, users] = await Promise.all([
    db.user.count({ where }),
    db.user.findMany({
      where,
      orderBy: [{ name: "asc" }],
      skip: (page - 1) * PAGE_SIZE,
      take: PAGE_SIZE,
    }),
  ]);

  const filters: FilterDef[] = [
    {
      key: "role",
      label: "Role",
      options: ROLES.map((r) => ({ value: r, label: ROLE_META[r].label })),
    },
    {
      key: "active",
      label: "Status",
      options: [
        { value: "true", label: "Active" },
        { value: "false", label: "Inactive" },
      ],
    },
  ];

  return (
    <>
      <PageHeader
        icon={Users}
        title="People"
        description="Agents, managers and end users across your organisation."
      />

      <PageBody className="grid gap-4">
        <ListToolbar filters={filters} searchPlaceholder="Search name or email…" />

        {users.length === 0 ? (
          <EmptyState
            icon={Users}
            title="No people found"
            description="Try adjusting your filters or search terms."
          />
        ) : (
          <div className="overflow-hidden rounded-xl border bg-card">
            <Table>
              <TableHeader>
                <TableRow className="hover:bg-transparent">
                  <TableHead>Name</TableHead>
                  <TableHead className="hidden lg:table-cell">Email</TableHead>
                  <TableHead>Role</TableHead>
                  <TableHead className="hidden md:table-cell">Department</TableHead>
                  <TableHead className="hidden xl:table-cell">Job title</TableHead>
                  <TableHead>Active</TableHead>
                  <TableHead className="hidden xl:table-cell text-right">
                    Last login
                  </TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {users.map((u) => (
                  <TableRow key={u.id} className="group">
                    <TableCell>
                      <Link
                        href={`/people/${u.id}`}
                        className="flex items-center gap-3"
                      >
                        <UserAvatar
                          name={u.name}
                          email={u.email}
                          image={u.image}
                        />
                        <span className="line-clamp-1 font-medium group-hover:text-primary">
                          {u.name ?? u.email}
                        </span>
                        {u.isVip ? <VipBadge label={false} /> : null}
                      </Link>
                    </TableCell>
                    <TableCell className="hidden lg:table-cell text-sm text-muted-foreground">
                      {u.email}
                    </TableCell>
                    <TableCell>
                      <StatusBadge map={ROLE_META} value={u.role} />
                    </TableCell>
                    <TableCell className="hidden md:table-cell text-sm text-muted-foreground">
                      {u.department ?? "—"}
                    </TableCell>
                    <TableCell className="hidden xl:table-cell text-sm text-muted-foreground">
                      {u.jobTitle ?? "—"}
                    </TableCell>
                    <TableCell>
                      <span className="inline-flex items-center gap-2 text-sm text-muted-foreground">
                        <span
                          className={
                            u.isActive
                              ? "size-2 rounded-full bg-emerald-500"
                              : "size-2 rounded-full bg-muted-foreground/40"
                          }
                        />
                        {u.isActive ? "Active" : "Inactive"}
                      </span>
                    </TableCell>
                    <TableCell className="hidden xl:table-cell text-right text-xs text-muted-foreground">
                      {u.lastLoginAt
                        ? formatDistanceToNow(u.lastLoginAt, { addSuffix: true })
                        : "Never"}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        )}

        <PaginationBar
          pathname="/people"
          searchParams={sp}
          page={page}
          pageSize={PAGE_SIZE}
          total={total}
        />
      </PageBody>
    </>
  );
}
