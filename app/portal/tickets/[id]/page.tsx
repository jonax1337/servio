import { notFound } from "next/navigation";
import type { Metadata } from "next";
import { ArrowLeft } from "lucide-react";
import { db } from "@/lib/db";
import { requireUser } from "@/lib/session";
import { LinkButton } from "@/components/link-button";
import { StatusBadge } from "@/components/status-badge";
import { PortalComment } from "@/components/portal/portal-comment";
import { UserAvatar } from "@/components/user-avatar";
import { AttachmentsCard } from "@/components/attachments/attachments-card";
import { sanitizeCommentHtml } from "@/lib/markdown";
import { iconForMime, formatBytes } from "@/lib/attachments-ui";
import { FormAnswers } from "@/components/tickets/form-answers";
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
      catalogItem: true,
      // only public (non-internal) comments are visible to the requester
      comments: { where: { isInternal: false }, include: { author: true, attachments: { orderBy: { createdAt: "asc" } } }, orderBy: { createdAt: "asc" } },
      attachments: { orderBy: { createdAt: "desc" } },
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
        <div className="mt-4 rounded-xl border bg-background p-4 text-sm leading-relaxed">
          {ticket.descriptionHtml ? (
            <div
              className="prose prose-sm dark:prose-invert max-w-none"
              dangerouslySetInnerHTML={{ __html: sanitizeCommentHtml(ticket.descriptionHtml) }}
            />
          ) : (
            <div className="whitespace-pre-wrap">{ticket.description || "No description provided."}</div>
          )}
        </div>
      </div>

      {ticket.formData ? (
        <FormAnswers className="mt-6" formSchema={ticket.formSchema ?? ticket.catalogItem?.formSchema} formData={ticket.formData} />
      ) : null}

      {ticket.attachments.length > 0 ? (
        <AttachmentsCard
          className="mt-6"
          attachments={ticket.attachments}
          target={{ ticketId: ticket.id }}
          canUpload={false}
          currentUserId={me.id}
        />
      ) : null}

      <div className="mt-6">
        <h2 className="mb-4 text-sm font-semibold">Conversation</h2>
        <div className="grid gap-4">
          {ticket.comments.map((c) => (
            <div key={c.id} className="flex gap-3">
              <UserAvatar name={c.author.name} email={c.author.email} className="shrink-0" />
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2">
                  <span className="text-sm font-medium">{c.author.name ?? c.author.email}</span>
                  <span className="text-xs text-muted-foreground">{format(c.createdAt, "PP p")}</span>
                </div>
                {c.bodyHtml ? (
                  <div
                    className="mt-1 rounded-lg border bg-card p-3 text-sm prose prose-sm dark:prose-invert max-w-none [&_[data-mention-id]]:rounded [&_[data-mention-id]]:bg-primary/10 [&_[data-mention-id]]:px-1 [&_[data-mention-id]]:font-medium [&_[data-mention-id]]:text-primary"
                    dangerouslySetInnerHTML={{ __html: sanitizeCommentHtml(c.bodyHtml) }}
                  />
                ) : (
                  <div className="mt-1 whitespace-pre-wrap rounded-lg border bg-card p-3 text-sm">{c.body}</div>
                )}
                {c.attachments.length > 0 ? (
                  <div className="mt-1.5 flex flex-wrap gap-1.5">
                    {c.attachments.map((a) => {
                      const Icon = iconForMime(a.mime);
                      return (
                        <a key={a.id} href={`/api/files/${a.id}`} download className="inline-flex items-center gap-1.5 rounded-md border bg-background px-2 py-1 text-xs hover:border-primary/40 hover:text-primary">
                          <Icon className="size-3.5 shrink-0 text-muted-foreground" />
                          <span className="max-w-48 truncate font-medium">{a.filename}</span>
                          <span className="text-muted-foreground">{formatBytes(a.size)}</span>
                        </a>
                      );
                    })}
                  </div>
                ) : null}
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
