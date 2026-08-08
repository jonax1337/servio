import Link from "next/link";
import type { Metadata } from "next";
import { ShoppingBag, ArrowRight, ShieldCheck, Clock } from "lucide-react";
import { db } from "@/lib/db";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { LinkButton } from "@/components/link-button";

export const metadata: Metadata = { title: "Service catalog" };
export const dynamic = "force-dynamic";

export default async function PortalCatalog() {
  const items = await db.catalogItem.findMany({
    where: { isPublished: true },
    orderBy: [{ order: "asc" }, { name: "asc" }],
    include: { category: true },
  });

  const groups = new Map<string, typeof items>();
  for (const it of items) {
    const key = it.category?.name ?? "General";
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key)!.push(it);
  }

  return (
    <div className="grid gap-8">
      <div>
        <h1 className="font-display text-2xl font-semibold tracking-tight">What can we get you?</h1>
        <p className="text-sm text-muted-foreground">Browse the catalog and request what you need — we&apos;ll take care of the rest.</p>
      </div>

      {[...groups.entries()].map(([category, group]) => (
        <section key={category}>
          <h2 className="mb-3 text-xs font-semibold uppercase tracking-wide text-muted-foreground">{category}</h2>
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {group.map((it) => (
              <Card key={it.id} className="flex h-full flex-col transition-colors hover:border-primary/40">
                <CardHeader>
                  <span className="grid size-11 place-items-center rounded-xl bg-primary/10 text-primary">
                    <ShoppingBag className="size-5" />
                  </span>
                  <CardTitle className="mt-3 text-base">{it.name}</CardTitle>
                </CardHeader>
                <CardContent className="flex flex-1 flex-col text-sm text-muted-foreground">
                  <p className="line-clamp-3 flex-1">{it.shortDescription ?? it.description}</p>
                  <div className="mt-4 flex items-center gap-3 text-xs">
                    {it.estimatedDays != null ? (
                      <span className="flex items-center gap-1"><Clock className="size-3.5" /> ~{it.estimatedDays} day{it.estimatedDays === 1 ? "" : "s"}</span>
                    ) : null}
                    {it.requiresApproval ? (
                      <span className="flex items-center gap-1 text-amber-600 dark:text-amber-400"><ShieldCheck className="size-3.5" /> Approval</span>
                    ) : null}
                  </div>
                  <div className="mt-3">
                    <LinkButton href={`/portal/request/${it.id}`} size="sm" className="w-full">
                      Request <ArrowRight className="size-3.5" />
                    </LinkButton>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        </section>
      ))}

      {items.length === 0 ? (
        <Card>
          <CardContent className="flex flex-col items-center gap-3 py-14 text-center text-sm text-muted-foreground">
            <ShoppingBag className="size-8" />
            The catalog is empty right now. Need something?
            <LinkButton href="/portal/new" size="sm">Submit a request</LinkButton>
          </CardContent>
        </Card>
      ) : null}
    </div>
  );
}
