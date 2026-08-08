import type { Metadata } from "next";
import { ShoppingBag, Sparkles } from "lucide-react";
import { db } from "@/lib/db";
import { LinkButton } from "@/components/link-button";
import { CatalogBrowser, type CatalogCard } from "@/components/catalog/catalog-browser";

export const metadata: Metadata = { title: "Service catalog" };
export const dynamic = "force-dynamic";

export default async function PortalCatalog() {
  const items = await db.catalogItem.findMany({
    where: { isPublished: true },
    orderBy: [{ order: "asc" }, { name: "asc" }],
    include: { category: true },
  });

  const cards: CatalogCard[] = items.map((it) => ({
    id: it.id,
    name: it.name,
    short: it.shortDescription ?? it.description ?? "",
    icon: it.icon,
    category: it.category?.name ?? "General",
    estimatedDays: it.estimatedDays,
    requiresApproval: it.requiresApproval,
  }));

  return (
    <div className="grid gap-8">
      {/* Hero */}
      <section className="relative overflow-hidden rounded-2xl border bg-card p-8 sm:p-10">
        <div className="absolute inset-0 bg-grid opacity-40" />
        <div className="absolute -right-16 -top-16 size-64 rounded-full bg-primary/15 blur-3xl" />
        <div className="relative flex items-center gap-4">
          <span className="hidden size-14 place-items-center rounded-2xl bg-primary/10 text-primary sm:grid">
            <ShoppingBag className="size-7" />
          </span>
          <div>
            <h1 className="font-display text-3xl font-semibold tracking-tight">What can we get you?</h1>
            <p className="mt-1 max-w-xl text-muted-foreground">
              Browse the catalog and request what you need — we&apos;ll route it and keep you posted.
            </p>
          </div>
        </div>
      </section>

      {cards.length === 0 ? (
        <div className="flex flex-col items-center gap-3 rounded-2xl border border-dashed py-16 text-center text-sm text-muted-foreground">
          <Sparkles className="size-8" />
          The catalog is empty right now. Need something?
          <LinkButton href="/portal/new" size="sm">Submit a request</LinkButton>
        </div>
      ) : (
        <CatalogBrowser items={cards} />
      )}
    </div>
  );
}
