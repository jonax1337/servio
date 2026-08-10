import Link from "next/link";
import { notFound } from "next/navigation";
import type { Metadata } from "next";
import { ArrowLeft, LifeBuoy, Timer, Ticket as TicketIcon } from "lucide-react";
import { db } from "@/lib/db";
import { getFormOptions } from "@/lib/data/options";
import { LinkButton } from "@/components/link-button";
import { StatusBadge } from "@/components/status-badge";
import { ServiceProperties } from "@/components/services/service-properties";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  SERVICE_STATUS_META,
  CRITICALITY_META,
  TICKET_STATUS_META,
  PRIORITY_META,
  OPEN_TICKET_STATUSES,
  ticketRef,
} from "@/lib/constants";
import { format } from "date-fns";

export const dynamic = "force-dynamic";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ id: string }>;
}): Promise<Metadata> {
  const { id } = await params;
  const s = await db.service.findUnique({
    where: { id },
    select: { name: true },
  });
  return { title: s ? s.name : "Service" };
}

export default async function ServiceDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;

  const [service, options] = await Promise.all([
    db.service.findUnique({
      where: { id },
      include: {
        owner: true,
        category: true,
        sla: true,
        tickets: {
          where: { status: { in: [...OPEN_TICKET_STATUSES] } },
          include: { assignee: true },
          orderBy: { updatedAt: "desc" },
          take: 20,
        },
      },
    }),
    getFormOptions(),
  ]);
  if (!service) notFound();

  return (
    <div className="grid gap-0 lg:grid-cols-[1fr_320px]">
      {/* Main column */}
      <div className="min-w-0 border-b lg:border-b-0 lg:border-r">
        <div className="flex items-center gap-3 border-b px-4 py-3 sm:px-6">
          <LinkButton href="/services" variant="ghost" size="icon-sm">
            <ArrowLeft className="size-4" />
          </LinkButton>
          <span className="text-sm font-medium text-muted-foreground">
            Service
          </span>
          <div className="ml-auto flex items-center gap-2">
            <StatusBadge map={CRITICALITY_META} value={service.criticality} dot />
            <StatusBadge map={SERVICE_STATUS_META} value={service.status} />
          </div>
        </div>

        <div className="p-4 sm:p-6">
          <div className="flex items-start gap-3">
            <div className="grid size-11 shrink-0 place-items-center rounded-xl border bg-muted text-primary">
              <LifeBuoy className="size-5.5" />
            </div>
            <div className="min-w-0">
              <h1 className="font-display text-2xl font-semibold tracking-tight">
                {service.name}
              </h1>
              <p className="mt-1 text-sm text-muted-foreground">
                Operational service
                {service.category ? ` · ${service.category.name}` : ""}
              </p>
            </div>
          </div>

          <div className="mt-4 rounded-xl border bg-card p-4 text-sm leading-relaxed whitespace-pre-wrap">
            {service.description || (
              <span className="text-muted-foreground">
                No description provided.
              </span>
            )}
          </div>

          {/* Open tickets */}
          <div className="mt-8">
            <h2 className="mb-4 flex items-center gap-2 text-sm font-semibold">
              <TicketIcon className="size-4 text-muted-foreground" />
              Open tickets · {service.tickets.length}
            </h2>
            {service.tickets.length === 0 ? (
              <p className="text-sm text-muted-foreground">
                No open tickets are linked to this service.
              </p>
            ) : (
              <div className="overflow-hidden rounded-xl border bg-card">
                {service.tickets.map((t) => (
                  <Link
                    key={t.id}
                    href={`/tickets/${t.id}`}
                    className="group flex items-center gap-3 border-b px-4 py-3 last:border-b-0 hover:bg-muted/40"
                  >
                    <span className="w-[76px] shrink-0 font-mono text-xs text-muted-foreground">
                      {ticketRef(t.id, t.prefix)}
                    </span>
                    <span className="min-w-0 flex-1 truncate text-sm font-medium group-hover:text-primary">
                      {t.title}
                    </span>
                    <StatusBadge
                      map={PRIORITY_META}
                      value={t.priority}
                      dot
                      className="hidden sm:inline-flex"
                    />
                    <StatusBadge map={TICKET_STATUS_META} value={t.status} />
                  </Link>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Sidebar */}
      <aside className="p-4 sm:p-6">
        <Card>
          <CardHeader>
            <CardTitle className="text-sm">Properties</CardTitle>
          </CardHeader>
          <CardContent>
            <ServiceProperties service={service} options={options} />
          </CardContent>
        </Card>

        <Card className="mt-4">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-sm">
              <Timer className="size-4 text-muted-foreground" />
              SLA
            </CardTitle>
          </CardHeader>
          <CardContent className="grid gap-2.5 text-sm">
            {service.sla ? (
              <>
                <Meta label="Policy" value={service.sla.name} />
                <Meta
                  label="Response"
                  value={`${service.sla.responseMins} min`}
                />
                <Meta
                  label="Resolve"
                  value={`${service.sla.resolveMins} min`}
                />
              </>
            ) : (
              <p className="text-muted-foreground">No SLA assigned.</p>
            )}
          </CardContent>
        </Card>

        <Card className="mt-4">
          <CardHeader>
            <CardTitle className="text-sm">Details</CardTitle>
          </CardHeader>
          <CardContent className="grid gap-2.5 text-sm">
            <Meta
              label="Owner"
              value={
                service.owner
                  ? (service.owner.name ?? service.owner.email)
                  : "—"
              }
            />
            <Meta
              label="Category"
              value={service.category ? service.category.name : "—"}
            />
            <Meta label="Created" value={format(service.createdAt, "PP")} />
            <Meta label="Updated" value={format(service.updatedAt, "PP")} />
          </CardContent>
        </Card>
      </aside>
    </div>
  );
}

function Meta({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between gap-2">
      <span className="text-muted-foreground">{label}</span>
      <span className="text-right font-medium tabular-nums">{value}</span>
    </div>
  );
}
