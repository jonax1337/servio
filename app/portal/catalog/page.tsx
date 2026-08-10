import type { Metadata } from "next";
import { ShoppingBag } from "lucide-react";
import { db } from "@/lib/db";
import { LinkButton } from "@/components/link-button";
import { CatalogBrowser, type CatalogCard } from "@/components/catalog/catalog-browser";
import { EmptyCatalogArt } from "@/components/portal/illustrations";

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
      <header className="flex items-start gap-4">
        <span className="hidden size-12 shrink-0 place-items-center rounded-2xl bg-primary/10 text-primary sm:grid">
          <ShoppingBag className="size-6" />
        </span>
        <div>
          <h1 className="font-display text-2xl font-semibold tracking-tight sm:text-3xl">
            Service catalog
          </h1>
          <p className="mt-1 max-w-xl text-muted-foreground">
            Request what you need. We&apos;ll route it to the right team and keep you posted every step.
          </p>
        </div>
      </header>

      {cards.length === 0 ? (
        <div className="flex flex-col items-center gap-2 rounded-2xl border bg-card py-14 text-center">
          <EmptyCatalogArt className="h-28 w-28" />
          <p className="font-medium">The catalog is empty</p>
          <p className="max-w-sm text-sm text-muted-foreground">
            Nothing has been published yet. Need something specific? Just ask.
          </p>
          <LinkButton href="/portal/new" size="sm" variant="outline" className="mt-1">Submit a request</LinkButton>
        </div>
      ) : (
        <CatalogBrowser items={cards} />
      )}
    </div>
  );
}
