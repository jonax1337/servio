import Link from "next/link";
import { notFound } from "next/navigation";
import type { Metadata } from "next";
import { ArrowLeft, Ticket as TicketIcon, Network, HardDrive } from "lucide-react";
import { db } from "@/lib/db";
import { getFormOptions } from "@/lib/data/options";
import { LinkButton } from "@/components/link-button";
import { StatusBadge, ToneBadge } from "@/components/status-badge";
import { AssetProperties } from "@/components/assets/asset-properties";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  ASSET_TYPE_META,
  ASSET_STATUS_META,
  ASSET_RELATION_META,
  TICKET_STATUS_META,
  metaFor,
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
  const a = await db.asset.findUnique({
    where: { id },
    select: { name: true },
  });
  return { title: a ? a.name : "Asset" };
}

export default async function AssetDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;

  const [asset, options] = await Promise.all([
    db.asset.findUnique({
      where: { id },
      include: {
        owner: true,
        group: true,
        syncSource: true,
        relationsFrom: { include: { target: true } },
        relationsTo: { include: { source: true } },
        tickets: { include: { ticket: true } },
      },
    }),
    getFormOptions(),
  ]);
  if (!asset) notFound();

  const specs: { label: string; value: React.ReactNode }[] = [];
  const push = (label: string, value: React.ReactNode) => {
    if (value !== null && value !== undefined && value !== "")
      specs.push({ label, value });
  };
  push("Type", <StatusBadge map={ASSET_TYPE_META} value={asset.type} dot />);
  push("Status", <StatusBadge map={ASSET_STATUS_META} value={asset.status} />);
  push("Serial", asset.serial ? <span className="font-mono">{asset.serial}</span> : null);
  push("Model", asset.model);
  push("Manufacturer", asset.manufacturer);
  push("OS", asset.os);
  push("CPU", asset.cpu);
  push("RAM", asset.ramGb != null ? `${asset.ramGb} GB` : null);
  push("Storage", asset.storageGb != null ? `${asset.storageGb} GB` : null);
  push("IP", asset.ipAddress ? <span className="font-mono">{asset.ipAddress}</span> : null);
  push("MAC", asset.macAddress ? <span className="font-mono">{asset.macAddress}</span> : null);
  push("Location", asset.location);
  push("Cost", asset.cost != null ? `$${asset.cost.toLocaleString()}` : null);
  push("Warranty end", asset.warrantyEnd ? format(asset.warrantyEnd, "PP") : null);

  return (
    <div className="grid gap-0 lg:grid-cols-[1fr_320px]">
      {/* Main column */}
      <div className="min-w-0 border-b lg:border-b-0 lg:border-r">
        <div className="flex items-center gap-3 border-b px-4 py-3 sm:px-6">
          <LinkButton href="/assets" variant="ghost" size="icon-sm">
            <ArrowLeft className="size-4" />
          </LinkButton>
          {asset.assetTag ? (
            <span className="font-mono text-sm text-muted-foreground">
              {asset.assetTag}
            </span>
          ) : null}
          <StatusBadge map={ASSET_TYPE_META} value={asset.type} dot />
          <div className="ml-auto flex items-center gap-2">
            <StatusBadge map={ASSET_STATUS_META} value={asset.status} />
          </div>
        </div>

        <div className="p-4 sm:p-6">
          <h1 className="font-display text-2xl font-semibold tracking-tight">
            {asset.name}
          </h1>
          <p className="mt-1 text-sm text-muted-foreground">
            {asset.manufacturer ? `${asset.manufacturer} · ` : ""}
            {asset.model ?? metaFor(ASSET_TYPE_META, asset.type).label}
            {asset.syncSource ? ` · synced from ${asset.syncSource.name}` : ""}
          </p>

          {/* Spec grid */}
          <div className="mt-4 rounded-xl border bg-card p-4">
            <dl className="grid gap-x-6 gap-y-3 sm:grid-cols-2">
              {specs.map((s) => (
                <div
                  key={s.label}
                  className="flex items-center justify-between gap-2 text-sm"
                >
                  <dt className="text-muted-foreground">{s.label}</dt>
                  <dd className="text-right font-medium">{s.value}</dd>
                </div>
              ))}
            </dl>
          </div>

          {asset.notes ? (
            <div className="mt-4 rounded-xl border bg-card p-4 text-sm leading-relaxed whitespace-pre-wrap">
              {asset.notes}
            </div>
          ) : null}

          {/* Relationships */}
          <div className="mt-8">
            <h2 className="mb-4 flex items-center gap-2 text-sm font-semibold">
              <Network className="size-4 text-muted-foreground" />
              Relationships ·{" "}
              {asset.relationsFrom.length + asset.relationsTo.length}
            </h2>
            {asset.relationsFrom.length + asset.relationsTo.length === 0 ? (
              <p className="text-sm text-muted-foreground">
                No related configuration items.
              </p>
            ) : (
              <div className="grid gap-2">
                {asset.relationsFrom.map((r) => (
                  <Link
                    key={r.id}
                    href={`/assets/${r.targetId}`}
                    className="flex items-center gap-2 rounded-lg border bg-card px-3 py-2 text-sm hover:border-primary/40"
                  >
                    <HardDrive className="size-4 text-indigo-500" />
                    <span className="text-muted-foreground">This</span>
                    <ToneBadge meta={metaFor(ASSET_RELATION_META, r.type)} />
                    <span className="font-medium">{r.target.name}</span>
                  </Link>
                ))}
                {asset.relationsTo.map((r) => (
                  <Link
                    key={r.id}
                    href={`/assets/${r.sourceId}`}
                    className="flex items-center gap-2 rounded-lg border bg-card px-3 py-2 text-sm hover:border-primary/40"
                  >
                    <HardDrive className="size-4 text-indigo-500" />
                    <span className="font-medium">{r.source.name}</span>
                    <ToneBadge meta={metaFor(ASSET_RELATION_META, r.type)} />
                    <span className="text-muted-foreground">this</span>
                  </Link>
                ))}
              </div>
            )}
          </div>

          {/* Linked tickets */}
          <div className="mt-8">
            <h2 className="mb-4 flex items-center gap-2 text-sm font-semibold">
              <TicketIcon className="size-4 text-muted-foreground" />
              Linked tickets · {asset.tickets.length}
            </h2>
            {asset.tickets.length === 0 ? (
              <p className="text-sm text-muted-foreground">
                No tickets linked to this asset.
              </p>
            ) : (
              <div className="grid gap-2">
                {asset.tickets.map((ta) => (
                  <Link
                    key={ta.ticketId}
                    href={`/tickets/${ta.ticketId}`}
                    className="flex items-center gap-3 rounded-lg border bg-card px-3 py-2 text-sm hover:border-primary/40"
                  >
                    <span className="font-mono text-xs text-muted-foreground">
                      {ticketRef(ta.ticket.id, ta.ticket.type)}
                    </span>
                    <span className="line-clamp-1 flex-1 font-medium">
                      {ta.ticket.title}
                    </span>
                    <StatusBadge
                      map={TICKET_STATUS_META}
                      value={ta.ticket.status}
                    />
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
            <AssetProperties asset={asset} options={options} />
          </CardContent>
        </Card>

        <Card className="mt-4">
          <CardHeader>
            <CardTitle className="text-sm">Ownership</CardTitle>
          </CardHeader>
          <CardContent className="grid gap-3 text-sm">
            <div className="flex items-center justify-between gap-2">
              <span className="text-muted-foreground">Owner</span>
              <span className="font-medium">
                {asset.owner ? asset.owner.name ?? asset.owner.email : "—"}
              </span>
            </div>
            <div className="flex items-center justify-between gap-2">
              <span className="text-muted-foreground">Group</span>
              <span className="font-medium">{asset.group?.name ?? "—"}</span>
            </div>
          </CardContent>
        </Card>

        <Card className="mt-4">
          <CardHeader>
            <CardTitle className="text-sm">Lifecycle</CardTitle>
          </CardHeader>
          <CardContent className="grid gap-2.5 text-sm">
            <Meta label="Added" value={format(asset.createdAt, "PP")} />
            {asset.purchaseDate ? (
              <Meta label="Purchased" value={format(asset.purchaseDate, "PP")} />
            ) : null}
            {asset.lastSeenAt ? (
              <Meta label="Last seen" value={format(asset.lastSeenAt, "PP p")} />
            ) : null}
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
