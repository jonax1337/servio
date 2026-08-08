import Link from "next/link";
import {
  AlertCircle, Sparkles, LifeBuoy, BookOpen, ArrowRight, Ticket as TicketIcon,
} from "lucide-react";
import { db } from "@/lib/db";
import { getSessionUser } from "@/lib/session";
import { LinkButton } from "@/components/link-button";
import { StatusBadge } from "@/components/status-badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { TICKET_STATUS_META, PRIORITY_META, ticketRef } from "@/lib/constants";
import { formatDistanceToNow } from "date-fns";

export const dynamic = "force-dynamic";

export default async function PortalHome() {
  const me = await getSessionUser();
  const [myTickets, services, articles] = await Promise.all([
    db.ticket.findMany({
      where: { requesterId: me?.id, status: { notIn: ["CLOSED", "CANCELLED"] } },
      orderBy: { updatedAt: "desc" },
      take: 5,
    }),
    db.service.findMany({ where: { isPublic: true }, orderBy: { name: "asc" }, take: 6 }),
    db.article.findMany({ where: { published: true }, orderBy: { views: "desc" }, take: 5 }),
  ]);

  return (
    <div className="grid gap-8">
      {/* Hero */}
      <section className="relative overflow-hidden rounded-2xl border bg-card p-8 sm:p-12">
        <div className="absolute inset-0 bg-grid opacity-50" />
        <div className="absolute -right-20 -top-20 size-72 rounded-full bg-primary/15 blur-3xl" />
        <div className="relative">
          <h1 className="font-display text-3xl font-semibold tracking-tight sm:text-4xl">
            Hi {me?.name?.split(" ")[0] ?? "there"}, how can we help?
          </h1>
          <p className="mt-2 max-w-lg text-muted-foreground">
            Report an issue, request a service, or search our knowledge base for quick answers.
          </p>
          <div className="mt-6 flex flex-wrap gap-3">
            <LinkButton href="/portal/new?type=INCIDENT" size="lg">
              <AlertCircle className="size-4" /> Report an issue
            </LinkButton>
            <LinkButton href="/portal/new?type=REQUEST" size="lg" variant="outline">
              <Sparkles className="size-4" /> Request a service
            </LinkButton>
          </div>
        </div>
      </section>

      <div className="grid gap-8 lg:grid-cols-3">
        {/* My tickets */}
        <div className="lg:col-span-2">
          <div className="mb-3 flex items-center justify-between">
            <h2 className="font-display text-lg font-semibold">My open requests</h2>
            <Link href="/portal/tickets" className="text-sm text-primary hover:underline">
              View all
            </Link>
          </div>
          {myTickets.length === 0 ? (
            <Card>
              <CardContent className="flex flex-col items-center gap-3 py-12 text-center">
                <div className="grid size-12 place-items-center rounded-xl bg-muted text-muted-foreground">
                  <TicketIcon className="size-6" />
                </div>
                <p className="text-sm text-muted-foreground">
                  You have no open requests. Everything looks good!
                </p>
                <LinkButton href="/portal/new" size="sm">New request</LinkButton>
              </CardContent>
            </Card>
          ) : (
            <Card>
              <CardContent className="divide-y p-0">
                {myTickets.map((t) => (
                  <Link
                    key={t.id}
                    href={`/portal/tickets/${t.id}`}
                    className="flex items-center gap-3 p-4 transition-colors hover:bg-muted/50"
                  >
                    <span className="w-16 shrink-0 font-mono text-xs text-muted-foreground">
                      {ticketRef(t.id, t.type)}
                    </span>
                    <span className="min-w-0 flex-1 truncate text-sm font-medium">{t.title}</span>
                    <StatusBadge map={PRIORITY_META} value={t.priority} dot />
                    <StatusBadge map={TICKET_STATUS_META} value={t.status} />
                    <span className="hidden shrink-0 text-xs text-muted-foreground sm:block">
                      {formatDistanceToNow(t.updatedAt, { addSuffix: true })}
                    </span>
                  </Link>
                ))}
              </CardContent>
            </Card>
          )}
        </div>

        {/* Knowledge */}
        <div>
          <div className="mb-3 flex items-center gap-2">
            <BookOpen className="size-4 text-muted-foreground" />
            <h2 className="font-display text-lg font-semibold">Popular articles</h2>
          </div>
          <Card>
            <CardContent className="grid gap-1 p-2">
              {articles.map((a) => (
                <Link
                  key={a.id}
                  href={`/portal/knowledge/${a.slug}`}
                  className="flex items-center justify-between gap-2 rounded-lg px-3 py-2 text-sm transition-colors hover:bg-muted"
                >
                  <span className="min-w-0 truncate">{a.title}</span>
                  <ArrowRight className="size-3.5 shrink-0 text-muted-foreground" />
                </Link>
              ))}
            </CardContent>
          </Card>
        </div>
      </div>

      {/* Service catalog */}
      <section>
        <div className="mb-3 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <LifeBuoy className="size-4 text-muted-foreground" />
            <h2 className="font-display text-lg font-semibold">Service catalog</h2>
          </div>
          <Link href="/portal/services" className="text-sm text-primary hover:underline">
            Browse all
          </Link>
        </div>
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {services.map((s) => (
            <Link key={s.id} href={`/portal/new?service=${s.id}`}>
              <Card className="h-full transition-colors hover:border-primary/40">
                <CardHeader>
                  <CardTitle className="flex items-center gap-2 text-base">
                    <span className="grid size-8 place-items-center rounded-lg bg-primary/10 text-primary">
                      <LifeBuoy className="size-4" />
                    </span>
                    {s.name}
                  </CardTitle>
                </CardHeader>
                <CardContent className="text-sm text-muted-foreground">
                  <p className="line-clamp-2">{s.description}</p>
                </CardContent>
              </Card>
            </Link>
          ))}
        </div>
      </section>
    </div>
  );
}
