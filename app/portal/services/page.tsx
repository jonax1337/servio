import Link from "next/link";
import type { Metadata } from "next";
import { LifeBuoy, ArrowRight, ShieldCheck } from "lucide-react";
import { db } from "@/lib/db";
import { StatusBadge } from "@/components/status-badge";
import { LinkButton } from "@/components/link-button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { SERVICE_STATUS_META } from "@/lib/constants";

export const metadata: Metadata = { title: "Service catalog" };
export const dynamic = "force-dynamic";

export default async function PortalServices() {
  const services = await db.service.findMany({
    where: { isPublic: true },
    orderBy: { name: "asc" },
    include: { category: true },
  });

  // group by category name
  const groups = new Map<string, typeof services>();
  for (const s of services) {
    const key = s.category?.name ?? "General";
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key)!.push(s);
  }

  return (
    <div className="grid gap-8">
      <div>
        <h1 className="font-display text-2xl font-semibold tracking-tight">Service catalog</h1>
        <p className="text-sm text-muted-foreground">Browse by category and request what you need.</p>
      </div>

      {[...groups.entries()].map(([category, items]) => (
        <section key={category}>
          <h2 className="mb-3 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
            {category}
          </h2>
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {items.map((s) => {
              const href = s.isRequestable ? `/portal/request/${s.id}` : `/portal/new?service=${s.id}`;
              return (
                <Card key={s.id} className="flex h-full flex-col transition-colors hover:border-primary/40">
                  <CardHeader>
                    <div className="flex items-start justify-between gap-2">
                      <span className="grid size-10 place-items-center rounded-lg bg-primary/10 text-primary">
                        <LifeBuoy className="size-5" />
                      </span>
                      <StatusBadge map={SERVICE_STATUS_META} value={s.status} />
                    </div>
                    <CardTitle className="mt-3 text-base">{s.name}</CardTitle>
                  </CardHeader>
                  <CardContent className="flex flex-1 flex-col text-sm text-muted-foreground">
                    <p className="line-clamp-3 flex-1">{s.description}</p>
                    <div className="mt-4 flex items-center justify-between">
                      {s.requiresApproval ? (
                        <span className="inline-flex items-center gap-1 text-xs text-amber-600 dark:text-amber-400">
                          <ShieldCheck className="size-3.5" /> Needs approval
                        </span>
                      ) : (
                        <span />
                      )}
                      <LinkButton href={href} size="sm">
                        {s.isRequestable ? "Request" : "Report issue"}
                        <ArrowRight className="size-3.5" />
                      </LinkButton>
                    </div>
                  </CardContent>
                </Card>
              );
            })}
          </div>
        </section>
      ))}
    </div>
  );
}
