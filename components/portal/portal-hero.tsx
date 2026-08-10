import Link from "next/link";
import { AlertCircle, ShoppingBag, BookOpen, ArrowRight } from "lucide-react";
import { PortalSearch } from "@/components/portal/portal-search";

const channels = [
  {
    href: "/portal/new?type=INCIDENT",
    label: "Report an issue",
    hint: "Something is broken or not working",
    icon: AlertCircle,
  },
  {
    href: "/portal/catalog",
    label: "Request a service",
    hint: "Hardware, access, software and more",
    icon: ShoppingBag,
  },
  {
    href: "/portal/knowledge",
    label: "Browse answers",
    hint: "Guides and fixes for common questions",
    icon: BookOpen,
  },
];

export function PortalHero({ firstName }: { firstName: string }) {
  return (
    <section className="relative overflow-hidden rounded-3xl border bg-card">
      <div className="pointer-events-none absolute inset-0 bg-aurora opacity-70" />
      <div className="pointer-events-none absolute inset-0 bg-grid-fade opacity-60" />
      <div className="relative px-6 py-10 sm:px-10 sm:py-14">
        <div className="mx-auto max-w-2xl text-center">
          <h1 className="font-display text-3xl font-semibold tracking-tight sm:text-4xl">
            How can we help, {firstName}?
          </h1>
          <p className="mx-auto mt-2 max-w-md text-muted-foreground">
            Search for an answer, request a service, or report an issue. Our team is one message away.
          </p>
          <PortalSearch className="mt-6 text-left" autoFocus />
        </div>

        <div className="mx-auto mt-8 grid max-w-3xl gap-3 sm:grid-cols-3">
          {channels.map((c) => (
            <Link
              key={c.href}
              href={c.href}
              className="group flex items-center gap-3 rounded-xl border bg-background/60 p-3 text-left backdrop-blur-sm transition-colors hover:border-primary/40 hover:bg-background sm:flex-col sm:items-start sm:gap-2 sm:p-4"
            >
              <span className="grid size-9 shrink-0 place-items-center rounded-lg bg-primary/10 text-primary">
                <c.icon className="size-4.5" />
              </span>
              <span className="min-w-0">
                <span className="flex items-center gap-1 text-sm font-medium">
                  {c.label}
                  <ArrowRight className="size-3.5 text-muted-foreground transition-transform group-hover:translate-x-0.5" />
                </span>
                <span className="mt-0.5 hidden text-xs text-muted-foreground sm:block">{c.hint}</span>
              </span>
            </Link>
          ))}
        </div>
      </div>
    </section>
  );
}
