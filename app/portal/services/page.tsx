import Link from "next/link";
import type { Metadata } from "next";
import { LifeBuoy } from "lucide-react";
import { db } from "@/lib/db";
import { StatusBadge } from "@/components/status-badge";
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

  return (
    <div className="grid gap-6">
      <div>
        <h1 className="font-display text-2xl font-semibold tracking-tight">Service catalog</h1>
        <p className="text-sm text-muted-foreground">Browse available services and request what you need.</p>
      </div>
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {services.map((s) => (
          <Link key={s.id} href={`/portal/new?service=${s.id}`}>
            <Card className="h-full transition-colors hover:border-primary/40">
              <CardHeader>
                <div className="flex items-start justify-between gap-2">
                  <span className="grid size-10 place-items-center rounded-lg bg-primary/10 text-primary">
                    <LifeBuoy className="size-5" />
                  </span>
                  <StatusBadge map={SERVICE_STATUS_META} value={s.status} />
                </div>
                <CardTitle className="mt-3 text-base">{s.name}</CardTitle>
              </CardHeader>
              <CardContent className="text-sm text-muted-foreground">
                <p className="line-clamp-3">{s.description}</p>
                {s.category ? (
                  <p className="mt-3 text-xs uppercase tracking-wide text-muted-foreground/70">{s.category.name}</p>
                ) : null}
              </CardContent>
            </Card>
          </Link>
        ))}
      </div>
    </div>
  );
}
