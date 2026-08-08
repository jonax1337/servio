import Link from "next/link";
import { notFound } from "next/navigation";
import type { Metadata } from "next";
import {
  ArrowLeft, Lock, Server, AlertTriangle, GitPullRequestArrow, Clock,
} from "lucide-react";
import { db } from "@/lib/db";
import { getFormOptions } from "@/lib/data/options";
import { LinkButton } from "@/components/link-button";
import { StatusBadge } from "@/components/status-badge";
import { TicketProperties } from "@/components/tickets/ticket-properties";
import { CommentComposer } from "@/components/tickets/comment-composer";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";
import {
  TICKET_STATUS_META, PRIORITY_META, TICKET_TYPE_META, SOURCE_META,
  ticketRef, problemRef, changeRef,
} from "@/lib/constants";
import { format, formatDistanceToNow } from "date-fns";

export const dynamic = "force-dynamic";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ id: string }>;
}): Promise<Metadata> {
  const { id } = await params;
  const t = await db.ticket.findUnique({ where: { id: Number(id) }, select: { title: true } });
  return { title: t ? t.title : "Ticket" };
}

function initials(s: string) {
  return s.split(" ").map((p) => p[0]).slice(0, 2).join("").toUpperCase();
}

export default async function TicketDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const ticketId = Number(id);
  if (!Number.isFinite(ticketId)) notFound();

  const [ticket, options] = await Promise.all([
    db.ticket.findUnique({
      where: { id: ticketId },
      include: {
        requester: true,
        assignee: true,
        service: true,
        sla: true,
        problem: true,
        change: true,
        comments: { include: { author: true }, orderBy: { createdAt: "asc" } },
        assets: { include: { asset: true } },
        tags: { include: { tag: true } },
        watchers: { include: { user: true } },
      },
    }),
    getFormOptions(),
  ]);
  if (!ticket) notFound();

  return (
    <div className="grid gap-0 lg:grid-cols-[1fr_320px]">
      {/* Main column */}
      <div className="min-w-0 border-b lg:border-b-0 lg:border-r">
        <div className="flex items-center gap-3 border-b px-4 py-3 sm:px-6">
          <LinkButton href="/tickets" variant="ghost" size="icon-sm">
            <ArrowLeft className="size-4" />
          </LinkButton>
          <span className="font-mono text-sm text-muted-foreground">
            {ticketRef(ticket.id, ticket.type)}
          </span>
          <StatusBadge map={TICKET_TYPE_META} value={ticket.type} dot />
          <div className="ml-auto flex items-center gap-2">
            <StatusBadge map={PRIORITY_META} value={ticket.priority} dot />
            <StatusBadge map={TICKET_STATUS_META} value={ticket.status} />
          </div>
        </div>

        <div className="p-4 sm:p-6">
          <h1 className="font-display text-2xl font-semibold tracking-tight">
            {ticket.title}
          </h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Opened by {ticket.requester.name ?? ticket.requester.email} ·{" "}
            {formatDistanceToNow(ticket.createdAt, { addSuffix: true })} · via{" "}
            {SOURCE_META[ticket.source]?.label ?? ticket.source}
          </p>

          <div className="mt-4 rounded-xl border bg-card p-4 text-sm leading-relaxed whitespace-pre-wrap">
            {ticket.description || <span className="text-muted-foreground">No description provided.</span>}
          </div>

          {/* Linked records */}
          {(ticket.problem || ticket.change || ticket.assets.length > 0) && (
            <div className="mt-4 flex flex-wrap gap-2">
              {ticket.problem ? (
                <Link href={`/problems/${ticket.problem.id}`} className="inline-flex items-center gap-1.5 rounded-lg border px-2.5 py-1 text-xs hover:border-primary/40">
                  <AlertTriangle className="size-3.5 text-amber-500" /> {problemRef(ticket.problem.id)} · {ticket.problem.title}
                </Link>
              ) : null}
              {ticket.change ? (
                <Link href={`/changes/${ticket.change.id}`} className="inline-flex items-center gap-1.5 rounded-lg border px-2.5 py-1 text-xs hover:border-primary/40">
                  <GitPullRequestArrow className="size-3.5 text-primary" /> {changeRef(ticket.change.id)}
                </Link>
              ) : null}
              {ticket.assets.map((a) => (
                <Link key={a.assetId} href={`/assets/${a.assetId}`} className="inline-flex items-center gap-1.5 rounded-lg border px-2.5 py-1 text-xs hover:border-primary/40">
                  <Server className="size-3.5 text-indigo-500" /> {a.asset.name}
                </Link>
              ))}
            </div>
          )}

          {/* Activity / comments */}
          <div className="mt-8">
            <h2 className="mb-4 flex items-center gap-2 text-sm font-semibold">
              <Clock className="size-4 text-muted-foreground" />
              Activity · {ticket.comments.length}
            </h2>
            <div className="grid gap-4">
              {ticket.comments.map((c) => (
                <div key={c.id} className="flex gap-3">
                  <Avatar className="size-8 shrink-0">
                    <AvatarFallback className="text-xs">
                      {initials(c.author.name ?? c.author.email)}
                    </AvatarFallback>
                  </Avatar>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <span className="text-sm font-medium">{c.author.name ?? c.author.email}</span>
                      {c.isInternal ? (
                        <span className="inline-flex items-center gap-1 rounded-full bg-amber-500/10 px-1.5 py-0.5 text-[10px] font-medium text-amber-600 dark:text-amber-400">
                          <Lock className="size-2.5" /> Internal
                        </span>
                      ) : null}
                      <span className="text-xs text-muted-foreground">
                        {formatDistanceToNow(c.createdAt, { addSuffix: true })}
                      </span>
                    </div>
                    <div className={`mt-1 rounded-lg border p-3 text-sm whitespace-pre-wrap ${c.isInternal ? "border-amber-500/20 bg-amber-500/5" : "bg-card"}`}>
                      {c.body}
                    </div>
                  </div>
                </div>
              ))}
              {ticket.comments.length === 0 ? (
                <p className="text-sm text-muted-foreground">No activity yet. Add the first reply below.</p>
              ) : null}
            </div>

            <div className="mt-4">
              <CommentComposer ticketId={ticket.id} />
            </div>
          </div>
        </div>
      </div>

      {/* Sidebar */}
      <aside className="p-4 sm:p-6">
        <Card>
          <CardHeader><CardTitle className="text-sm">Properties</CardTitle></CardHeader>
          <CardContent>
            <TicketProperties ticket={ticket} options={options} />
          </CardContent>
        </Card>

        <Card className="mt-4">
          <CardHeader><CardTitle className="text-sm">People</CardTitle></CardHeader>
          <CardContent className="grid gap-3 text-sm">
            <div className="flex items-center justify-between">
              <span className="text-muted-foreground">Requester</span>
              <span className="font-medium">{ticket.requester.name ?? ticket.requester.email}</span>
            </div>
            {ticket.watchers.length > 0 ? (
              <div className="flex items-center justify-between">
                <span className="text-muted-foreground">Watchers</span>
                <span className="font-medium">{ticket.watchers.length}</span>
              </div>
            ) : null}
          </CardContent>
        </Card>

        <Card className="mt-4">
          <CardHeader><CardTitle className="text-sm">Timeline & SLA</CardTitle></CardHeader>
          <CardContent className="grid gap-2.5 text-sm">
            <Meta label="Created" value={format(ticket.createdAt, "PP p")} />
            {ticket.dueAt ? <Meta label="Due" value={format(ticket.dueAt, "PP p")} /> : null}
            {ticket.firstResponseAt ? <Meta label="First response" value={format(ticket.firstResponseAt, "PP p")} /> : null}
            {ticket.resolvedAt ? <Meta label="Resolved" value={format(ticket.resolvedAt, "PP p")} /> : null}
            {ticket.sla ? <Meta label="SLA" value={ticket.sla.name} /> : null}
          </CardContent>
        </Card>

        {ticket.tags.length > 0 ? (
          <div className="mt-4 flex flex-wrap gap-1.5">
            {ticket.tags.map((t) => (
              <span key={t.tagId} className="rounded-full border px-2 py-0.5 text-xs" style={{ borderColor: t.tag.color + "55", color: t.tag.color }}>
                #{t.tag.name}
              </span>
            ))}
          </div>
        ) : null}
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
