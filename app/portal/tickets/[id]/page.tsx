import { notFound } from "next/navigation";
import type { Metadata } from "next";
import { ArrowLeft } from "lucide-react";
import { db } from "@/lib/db";
import { requireUser } from "@/lib/session";
import { LinkButton } from "@/components/link-button";
import { StatusBadge } from "@/components/status-badge";
import { PortalComment } from "@/components/portal/portal-comment";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import {
  TICKET_STATUS_META, PRIORITY_META, TICKET_TYPE_META, ticketRef,
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
  return { title: t?.title ?? "Ticket" };
}

function initials(s: string) {
  return s.split(" ").map((p) => p[0]).slice(0, 2).join("").toUpperCase();
}

export default async function PortalTicketDetail({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const me = await requireUser();
  const { id } = await params;

  const ticket = await db.ticket.findFirst({
    where: { id: Number(id), requesterId: me.id },
    include: {
      assignee: true,
      service: true,
      // only public (non-internal) comments are visible to the requester
      comments: { where: { isInternal: false }, include: { author: true }, orderBy: { createdAt: "asc" } },
    },
  });
  if (!ticket) notFound();

  return (
    <div className="mx-auto max-w-3xl">
      <LinkButton href="/portal/tickets" variant="ghost" size="sm" className="mb-4">
        <ArrowLeft className="size-4" /> Back to my tickets
      </LinkButton>

      <div className="rounded-2xl border bg-card p-6">
        <div className="flex flex-wrap items-center gap-2">
          <span className="font-mono text-sm text-muted-foreground">{ticketRef(ticket.id, ticket.type)}</span>
          <StatusBadge map={TICKET_TYPE_META} value={ticket.type} dot />
          <div className="ml-auto flex items-center gap-2">
            <StatusBadge map={PRIORITY_META} value={ticket.priority} dot />
            <StatusBadge map={TICKET_STATUS_META} value={ticket.status} />
          </div>
        </div>
        <h1 className="mt-3 font-display text-2xl font-semibold tracking-tight">{ticket.title}</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Submitted {formatDistanceToNow(ticket.createdAt, { addSuffix: true })}
          {ticket.service ? ` · ${ticket.service.name}` : ""}
          {ticket.assignee ? ` · Handled by ${ticket.assignee.name ?? "the Service Desk"}` : " · Awaiting assignment"}
        </p>
        <div className="mt-4 whitespace-pre-wrap rounded-xl border bg-background p-4 text-sm leading-relaxed">
          {ticket.description || "No description provided."}
        </div>
      </div>

      <div className="mt-6">
        <h2 className="mb-4 text-sm font-semibold">Conversation</h2>
        <div className="grid gap-4">
          {ticket.comments.map((c) => (
            <div key={c.id} className="flex gap-3">
              <Avatar className="size-8 shrink-0">
                <AvatarFallback className="text-xs">{initials(c.author.name ?? c.author.email)}</AvatarFallback>
              </Avatar>
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2">
                  <span className="text-sm font-medium">{c.author.name ?? c.author.email}</span>
                  <span className="text-xs text-muted-foreground">{format(c.createdAt, "PP p")}</span>
                </div>
                <div className="mt-1 whitespace-pre-wrap rounded-lg border bg-card p-3 text-sm">{c.body}</div>
              </div>
            </div>
          ))}
          {ticket.comments.length === 0 ? (
            <p className="text-sm text-muted-foreground">No replies yet. Our team will be in touch soon.</p>
          ) : null}
        </div>

        {ticket.status !== "CLOSED" && ticket.status !== "CANCELLED" ? (
          <div className="mt-4">
            <PortalComment ticketId={ticket.id} />
          </div>
        ) : null}
      </div>
    </div>
  );
}
