import Link from "next/link";
import { ArrowRight } from "lucide-react";
import { PortalSearch } from "@/components/portal/portal-search";
import {
  ReportIssueArt, RequestServiceArt, NoResultsArt,
} from "@/components/portal/illustrations";

const channels = [
  {
    href: "/portal/new?type=INCIDENT",
    label: "Report an issue",
    hint: "Something isn't working",
    Art: ReportIssueArt,
  },
  {
    href: "/portal/catalog",
    label: "Request a service",
    hint: "Access, hardware, software",
    Art: RequestServiceArt,
  },
  {
    href: "/portal/knowledge",
    label: "Browse answers",
    hint: "Guides and quick fixes",
    Art: NoResultsArt,
  },
];

export function PortalHero({ firstName }: { firstName: string }) {
  return (
    <section className="relative overflow-hidden rounded-3xl border bg-card">
      <div className="pointer-events-none absolute inset-0 bg-aurora opacity-60" />
      <div className="relative px-6 py-12 sm:px-10 sm:py-14">
        <div className="mx-auto max-w-2xl text-center">
          <h1 className="font-display text-3xl font-semibold tracking-tight sm:text-4xl">
            Hi {firstName}, how can we help?
          </h1>
          <p className="mx-auto mt-2 max-w-md text-muted-foreground">
            Search for an answer, request a service, or report an issue. Our team is one message away.
          </p>
          <PortalSearch className="mt-6 text-left" autoFocus />
        </div>

        <div className="mx-auto mt-8 grid max-w-3xl gap-4 sm:grid-cols-3">
          {channels.map((c) => (
            <Link
              key={c.href}
              href={c.href}
              className="group flex flex-col items-center gap-1 rounded-2xl border bg-background/70 p-5 text-center transition-colors hover:border-primary/40 hover:bg-background"
            >
              <c.Art className="h-20 w-auto" />
              <span className="mt-1 flex items-center gap-1 text-sm font-semibold">
                {c.label}
                <ArrowRight className="size-3.5 text-muted-foreground transition-transform group-hover:translate-x-0.5" />
              </span>
              <span className="text-xs text-muted-foreground">{c.hint}</span>
            </Link>
          ))}
        </div>
      </div>
    </section>
  );
}
