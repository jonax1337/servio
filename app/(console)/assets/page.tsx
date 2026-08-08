import Link from "next/link";
import { HardDrive, Plus } from "lucide-react";
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
import {
  ASSET_TYPE_META,
  ASSET_STATUS_META,
  ASSET_TYPES,
  ASSET_STATUSES,
} from "@/lib/constants";

export const metadata: Metadata = { title: "Assets" };
export const dynamic = "force-dynamic";

export default async function AssetsPage({
  searchParams,
}: {
  searchParams: Promise<SearchParams>;
}) {
  const sp = await searchParams;
  const page = getPage(sp);
  const q = getParam(sp, "q");
  const type = getParam(sp, "type");
  const status = getParam(sp, "status");

  const where: Prisma.AssetWhereInput = {};
  if (q)
    where.OR = [
      { name: { contains: q } },
      { assetTag: { contains: q } },
      { serial: { contains: q } },
    ];
  if (type && type !== "all") where.type = type;
  if (status && status !== "all") where.status = status;

  const [total, assets] = await Promise.all([
    db.asset.count({ where }),
    db.asset.findMany({
      where,
      include: { owner: true },
      orderBy: [{ updatedAt: "desc" }],
      skip: (page - 1) * PAGE_SIZE,
      take: PAGE_SIZE,
    }),
  ]);

  const filters: FilterDef[] = [
    {
      key: "type",
      label: "Type",
      options: ASSET_TYPES.map((t) => ({
        value: t,
        label: ASSET_TYPE_META[t].label,
      })),
    },
    {
      key: "status",
      label: "Status",
      options: ASSET_STATUSES.map((s) => ({
        value: s,
        label: ASSET_STATUS_META[s].label,
      })),
    },
  ];

  return (
    <>
      <PageHeader
        icon={HardDrive}
        title="Assets"
        description="Configuration items and hardware tracked in the CMDB."
      >
        <LinkButton href="/assets/new">
          <Plus className="size-4" /> New asset
        </LinkButton>
      </PageHeader>

      <PageBody className="grid gap-4">
        <ListToolbar filters={filters} searchPlaceholder="Search assets…" />

        {assets.length === 0 ? (
          <EmptyState
            icon={HardDrive}
            title="No assets found"
            description="Try adjusting your filters, or add a new asset to the CMDB."
          >
            <LinkButton href="/assets/new" size="sm">
              <Plus className="size-4" /> New asset
            </LinkButton>
          </EmptyState>
        ) : (
          <div className="overflow-hidden rounded-xl border bg-card">
            <Table>
              <TableHeader>
                <TableRow className="hover:bg-transparent">
                  <TableHead>Name</TableHead>
                  <TableHead>Type</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead className="hidden md:table-cell">Owner</TableHead>
                  <TableHead className="hidden lg:table-cell">Location</TableHead>
                  <TableHead className="hidden xl:table-cell">IP address</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {assets.map((a) => (
                  <TableRow key={a.id} className="group">
                    <TableCell className="max-w-[360px]">
                      <Link href={`/assets/${a.id}`} className="block">
                        <span className="line-clamp-1 font-medium group-hover:text-primary">
                          {a.name}
                        </span>
                        {a.assetTag ? (
                          <span className="font-mono text-xs text-muted-foreground">
                            {a.assetTag}
                          </span>
                        ) : null}
                      </Link>
                    </TableCell>
                    <TableCell>
                      <StatusBadge map={ASSET_TYPE_META} value={a.type} dot />
                    </TableCell>
                    <TableCell>
                      <StatusBadge map={ASSET_STATUS_META} value={a.status} />
                    </TableCell>
                    <TableCell className="hidden md:table-cell text-sm text-muted-foreground">
                      {a.owner ? a.owner.name ?? a.owner.email : "—"}
                    </TableCell>
                    <TableCell className="hidden lg:table-cell text-sm text-muted-foreground">
                      {a.location ?? "—"}
                    </TableCell>
                    <TableCell className="hidden xl:table-cell font-mono text-xs text-muted-foreground">
                      {a.ipAddress ?? "—"}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        )}

        <PaginationBar
          pathname="/assets"
          searchParams={sp}
          page={page}
          pageSize={PAGE_SIZE}
          total={total}
        />
      </PageBody>
    </>
  );
}
