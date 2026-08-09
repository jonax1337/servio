"use client";

import { useState } from "react";
import Link from "next/link";
import { ArrowRight, ShieldCheck, Clock, LayoutGrid } from "lucide-react";
import { cn } from "@/lib/utils";
import { CatalogIcon } from "@/components/catalog/catalog-icon";

export type CatalogCard = {
  id: string;
  name: string;
  short: string;
  icon: string | null;
  category: string;
  estimatedDays: number | null;
  requiresApproval: boolean;
};

export function CatalogBrowser({ items }: { items: CatalogCard[] }) {
  const categories = Array.from(new Set(items.map((i) => i.category)));
  const [active, setActive] = useState<string>("All");
  const shown = active === "All" ? items : items.filter((i) => i.category === active);

  const chip = (label: string) => (
    <button
      key={label}
      type="button"
      aria-pressed={active === label}
      onClick={() => setActive(label)}
      className={cn(
        "inline-flex items-center gap-1.5 whitespace-nowrap rounded-full border px-3.5 py-1.5 text-sm font-medium transition-colors",
        active === label
          ? "border-primary bg-primary text-primary-foreground"
          : "bg-card text-muted-foreground hover:border-primary/40 hover:text-foreground",
      )}
    >
      {label === "All" ? <LayoutGrid className="size-3.5" /> : null}
      {label}
      <span className={cn("rounded-full px-1.5 text-xs tabular-nums", active === label ? "bg-primary-foreground/20" : "bg-muted")}>
        {label === "All" ? items.length : items.filter((i) => i.category === label).length}
      </span>
    </button>
  );

  return (
    <div className="grid gap-6">
      {/* Category navigation */}
      <div role="group" aria-label="Filter by category" className="-mx-1 flex flex-wrap gap-2 px-1">
        {chip("All")}
        {categories.map((c) => chip(c))}
      </div>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {shown.map((it) => (
          <Link
            key={it.id}
            href={`/portal/request/${it.id}`}
            className="group relative flex flex-col overflow-hidden rounded-2xl border bg-card p-5 transition-all hover:-translate-y-0.5 hover:border-primary/50 hover:shadow-lg hover:shadow-primary/5"
          >
            <div className="absolute -right-8 -top-8 size-24 rounded-full bg-primary/5 blur-2xl transition-opacity group-hover:opacity-100" />
            <div className="relative flex items-start justify-between">
              <span className="grid size-12 place-items-center rounded-xl bg-gradient-to-br from-primary/20 to-primary/5 text-primary ring-1 ring-primary/10">
                <CatalogIcon name={it.icon} className="size-6" />
              </span>
              <span className="rounded-full bg-muted px-2 py-0.5 text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
                {it.category}
              </span>
            </div>

            <h3 className="mt-4 font-display text-base font-semibold tracking-tight">{it.name}</h3>
            <p className="mt-1 line-clamp-2 flex-1 text-sm text-muted-foreground">{it.short}</p>

            <div className="mt-4 flex items-center gap-3 text-xs text-muted-foreground">
              {it.estimatedDays != null ? (
                <span className="flex items-center gap-1"><Clock className="size-3.5" /> ~{it.estimatedDays}d</span>
              ) : null}
              {it.requiresApproval ? (
                <span className="flex items-center gap-1 text-amber-600 dark:text-amber-400"><ShieldCheck className="size-3.5" /> Approval</span>
              ) : null}
              <span className="ml-auto flex items-center gap-1 font-medium text-primary opacity-0 transition-opacity group-hover:opacity-100">
                Request <ArrowRight className="size-3.5" />
              </span>
            </div>
          </Link>
        ))}
      </div>

      {shown.length === 0 ? (
        <p className="py-10 text-center text-sm text-muted-foreground">Nothing in this category yet.</p>
      ) : null}
    </div>
  );
}
