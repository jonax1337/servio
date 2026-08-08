import Link from "next/link";
import { LifeBuoy, Plus, User } from "lucide-react";
import type { Metadata } from "next";
import type { Prisma } from "@prisma/client";
import { db } from "@/lib/db";
import { getParam, type SearchParams } from "@/lib/query";
import { PageHeader, PageBody } from "@/components/page-header";
import { LinkButton } from "@/components/link-button";
import { ListToolbar, type FilterDef } from "@/components/list-toolbar";
import { StatusBadge } from "@/components/status-badge";
import { EmptyState } from "@/components/empty-state";
import {
  SERVICE_STATUS_META,
  SERVICE_STATUSES,
  CRITICALITY_META,
  CRITICALITIES,
  OPEN_TICKET_STATUSES,
} from "@/lib/constants";

export const metadata: Metadata = { title: "Services" };
export const dynamic = "force-dynamic";

export default async function ServicesPage({
  searchParams,
}: {
  searchParams: Promise<SearchParams>;
}) {
  const sp = await searchParams;
  const q = getParam(sp, "q");
  const status = getParam(sp, "status");
  const criticality = getParam(sp, "criticality");

  const where: Prisma.ServiceWhereInput = {};
  if (q) where.name = { contains: q };
  if (status && status !== "all") where.status = status;
  if (criticality && criticality !== "all") where.criticality = criticality;

  const services = await db.service.findMany({
    where,
    include: {
      owner: true,
      _count: {
        select: { tickets: { where: { status: { in: [...OPEN_TICKET_STATUSES] } } } },
      },
    },
    orderBy: [{ name: "asc" }],
  });

  const filters: FilterDef[] = [
    {
      key: "status",
      label: "Status",
      options: SERVICE_STATUSES.map((s) => ({
        value: s,
        label: SERVICE_STATUS_META[s].label,
      })),
    },
    {
      key: "criticality",
      label: "Criticality",
      options: CRITICALITIES.map((c) => ({
        value: c,
        label: CRITICALITY_META[c].label,
      })),
    },
  ];

  return (
    <>
      <PageHeader
        icon={LifeBuoy}
        title="Services"
        description="The catalog of business and IT services you support."
      >
        <LinkButton href="/services/new">
          <Plus className="size-4" /> New service
        </LinkButton>
      </PageHeader>

      <PageBody className="grid gap-4">
        <ListToolbar filters={filters} searchPlaceholder="Search services…" />

        {services.length === 0 ? (
          <EmptyState
            icon={LifeBuoy}
            title="No services found"
            description="Try adjusting your filters, or add a new service to the catalog."
          >
            <LinkButton href="/services/new" size="sm">
              <Plus className="size-4" /> New service
            </LinkButton>
          </EmptyState>
        ) : (
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {services.map((s) => (
              <Link
                key={s.id}
                href={`/services/${s.id}`}
                className="group flex flex-col gap-4 rounded-xl border bg-card p-4 transition-colors hover:border-primary/40"
              >
                <div className="flex items-start gap-3">
                  <div className="grid size-10 shrink-0 place-items-center rounded-lg border bg-muted text-primary">
                    <LifeBuoy className="size-5" />
                  </div>
                  <div className="min-w-0 flex-1">
                    <h3 className="line-clamp-1 font-medium group-hover:text-primary">
                      {s.name}
                    </h3>
                    {s.description ? (
                      <p className="mt-0.5 line-clamp-2 text-xs text-muted-foreground">
                        {s.description}
                      </p>
                    ) : null}
                  </div>
                </div>

                <div className="flex flex-wrap items-center gap-1.5">
                  <StatusBadge map={SERVICE_STATUS_META} value={s.status} />
                  <StatusBadge
                    map={CRITICALITY_META}
                    value={s.criticality}
                    dot
                  />
                </div>

                <div className="mt-auto flex items-center justify-between border-t pt-3 text-xs text-muted-foreground">
                  <span className="flex items-center gap-1.5">
                    <User className="size-3.5" />
                    {s.owner ? (s.owner.name ?? s.owner.email) : "Unassigned"}
                  </span>
                  <span className="tabular-nums">
                    {s._count.tickets} open{" "}
                    {s._count.tickets === 1 ? "ticket" : "tickets"}
                  </span>
                </div>
              </Link>
            ))}
          </div>
        )}
      </PageBody>
    </>
  );
}
