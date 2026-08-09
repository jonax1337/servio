import Link from "next/link";
import { notFound } from "next/navigation";
import type { Metadata } from "next";
import {
  ArrowLeft, Server, AlertTriangle, GitPullRequestArrow,
  Flame, Link2, ListChecks, GitMerge, X, CheckCircle2,
} from "lucide-react";
import { db } from "@/lib/db";
import { getFormOptions } from "@/lib/data/options";
import { getSessionUser, isAgent, type Role } from "@/lib/session";
import { LinkButton } from "@/components/link-button";
import { StatusBadge, VipBadge, ToneBadge } from "@/components/status-badge";
import { TicketProperties } from "@/components/tickets/ticket-properties";
import { CommentThread } from "@/components/comments/comment-thread";
import { SummarizeButton } from "@/components/tickets/summarize-button";
import { aiConfigured, aiTeaserEnabled } from "@/lib/ai";
import { EditEntityDialog } from "@/components/edit-entity-dialog";
import { addTicketComment, updateTicketDetails, unlinkTicket, unlinkAsset, unlinkRelation } from "@/lib/actions/tickets";
import { TicketActions } from "@/components/tickets/ticket-actions";
import { TicketTasks } from "@/components/tickets/ticket-tasks";
import { SlaBadge } from "@/components/tickets/sla-badge";
import { DueDatePicker } from "@/components/tickets/due-date-picker";
import { FormAnswers } from "@/components/tickets/form-answers";
import { WorkLog } from "@/components/tickets/work-log";
import { AttachmentsCard } from "@/components/attachments/attachments-card";
import { sanitizeCommentHtml } from "@/lib/markdown";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  TICKET_STATUS_META, PRIORITY_META, TICKET_TYPE_META, SOURCE_META,
  PENDING_REASON_META, RESOLUTION_CODE_META, metaFor,
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

export default async function TicketDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const ticketId = Number(id);
  if (!Number.isFinite(ticketId)) notFound();

  const me = await getSessionUser();
  const [ticket, options, audits, candidates] = await Promise.all([
    db.ticket.findUnique({
      where: { id: ticketId },
      include: {
        requester: true,
        assignee: true,
        service: true,
        sla: true,
        catalogItem: true,
        problem: true,
        change: true,
        mergedInto: true,
        comments: { include: { author: true, attachments: { orderBy: { createdAt: "asc" } } }, orderBy: { createdAt: "asc" } },
        assets: { include: { asset: true } },
        tags: { include: { tag: true } },
        watchers: { include: { user: true } },
        tasks: { orderBy: { order: "asc" } },
        worklogs: { include: { user: true }, orderBy: { loggedAt: "desc" } },
        attachments: { orderBy: { createdAt: "desc" } },
        linksFrom: { include: { linked: true } },
      },
    }),
    getFormOptions(),
    db.auditLog.findMany({
      where: { entity: "Ticket", entityId: String(ticketId) },
      include: { user: true },
      orderBy: { createdAt: "asc" },
    }),
    db.ticket.findMany({
      where: { id: { not: ticketId }, status: { notIn: ["CLOSED", "CANCELLED"] } },
      select: { id: true, title: true, type: true },
      orderBy: { updatedAt: "desc" },
      take: 60,
    }),
  ]);
  if (!ticket) notFound();

  const aiEnabled = aiConfigured();
  const aiTeaser = !aiEnabled && aiTeaserEnabled(); // show buttons as a preview when disabled
  const aiVisible = aiEnabled || aiTeaser;
  const isWatching = !!me && ticket.watchers.some((w) => w.userId === me.id);
  const candidateOpts = candidates.map((c) => ({
    value: String(c.id),
    label: `${ticketRef(c.id, c.type)} — ${c.title}`,
  }));

  const comments = ticket.comments.map((c) => ({
    id: c.id, author: c.author.name ?? c.author.email, body: c.body, bodyHtml: c.bodyHtml, isInternal: c.isInternal, createdAt: c.createdAt, attachments: c.attachments,
  }));
  const activity = audits
    .filter((a) => a.summary && a.summary !== "Added a comment")
    .map((a) => ({ id: a.id, who: a.user?.name ?? "System", summary: a.summary!, createdAt: a.createdAt }));

  return (
    <div className="grid gap-0 lg:grid-cols-[1fr_340px]">
      {/* Main column */}
      <div className="min-w-0 border-b lg:border-b-0 lg:border-r">
        <div className="flex flex-wrap items-center gap-3 border-b px-4 py-3 sm:px-6">
          <LinkButton href="/tickets" variant="ghost" size="icon-sm">
            <ArrowLeft className="size-4" />
          </LinkButton>
          <span className="font-mono text-sm text-muted-foreground">
            {ticketRef(ticket.id, ticket.type)}
          </span>
          <StatusBadge map={TICKET_TYPE_META} value={ticket.type} />
          <StatusBadge map={PRIORITY_META} value={ticket.priority} />
          <StatusBadge map={TICKET_STATUS_META} value={ticket.status} />
          <div className="ml-auto flex items-center gap-2">
            <EditEntityDialog
              action={updateTicketDetails}
              idField="id"
              id={ticket.id}
              title={ticket.title}
              description={ticket.description}
              descriptionHtml={ticket.descriptionHtml}
              entityLabel="ticket"
            />
            <TicketActions
              ticketId={ticket.id}
              isWatching={isWatching}
              isMajorIncident={ticket.isMajorIncident}
              candidates={candidateOpts}
              watchers={ticket.watchers.map((w) => w.user.name ?? w.user.email)}
              people={options.agents
                .filter((a) => a.id !== me?.id)
                .map((a) => ({ value: a.id, label: a.name ?? a.email }))}
            />
          </div>
        </div>

        {ticket.isMajorIncident ? (
          <div className="flex items-center gap-2 border-b border-destructive/30 bg-destructive/10 px-4 py-2.5 text-sm font-medium text-destructive sm:px-6">
            <Flame className="size-4" /> Major Incident — all hands. Stakeholders are being notified.
          </div>
        ) : null}

        {ticket.pendingReason && (ticket.status === "PENDING" || ticket.status === "ON_HOLD") ? (
          <div className="flex flex-wrap items-center gap-2 border-b bg-amber-500/5 px-4 py-2.5 text-sm sm:px-6">
            <ToneBadge meta={metaFor(PENDING_REASON_META, ticket.pendingReason)} />
            {ticket.pendingNote ? <span className="text-muted-foreground">{ticket.pendingNote}</span> : null}
          </div>
        ) : null}

        {ticket.resolutionNote && ["RESOLVED", "CLOSED", "CANCELLED"].includes(ticket.status) ? (
          <div className="flex flex-wrap items-center gap-2 border-b bg-emerald-500/5 px-4 py-2.5 text-sm sm:px-6">
            {ticket.resolutionCode ? (
              <ToneBadge meta={metaFor(RESOLUTION_CODE_META, ticket.resolutionCode)} />
            ) : (
              <CheckCircle2 className="size-4 text-emerald-500" />
            )}
            <span className="text-muted-foreground">{ticket.resolutionNote}</span>
          </div>
        ) : null}

        {ticket.mergedInto ? (
          <div className="flex items-center gap-2 border-b bg-muted/50 px-4 py-2.5 text-sm sm:px-6">
            <GitMerge className="size-4 text-muted-foreground" />
            This ticket was merged into{" "}
            <Link href={`/tickets/${ticket.mergedInto.id}`} className="font-medium text-primary hover:underline">
              {ticketRef(ticket.mergedInto.id, ticket.mergedInto.type)}
            </Link>
            .
          </div>
        ) : null}

        <div className="p-4 sm:p-6">
          <h1 className="font-display text-2xl font-semibold tracking-tight">
            {ticket.title}
          </h1>
          <p className="mt-1 flex flex-wrap items-center gap-x-1.5 text-sm text-muted-foreground">
            <span>Opened by {ticket.requester.name ?? ticket.requester.email}</span>
            {ticket.requester.isVip ? <VipBadge className="align-middle" /> : null}
            <span>· {formatDistanceToNow(ticket.createdAt, { addSuffix: true })} · via {SOURCE_META[ticket.source]?.label ?? ticket.source}</span>
          </p>

          <div className="mt-4 rounded-xl border bg-card p-4 text-sm leading-relaxed">
            {ticket.descriptionHtml ? (
              <div
                className="prose prose-sm dark:prose-invert max-w-none"
                dangerouslySetInnerHTML={{ __html: sanitizeCommentHtml(ticket.descriptionHtml) }}
              />
            ) : ticket.description ? (
              <div className="whitespace-pre-wrap">{ticket.description}</div>
            ) : (
              <span className="text-muted-foreground">No description provided.</span>
            )}
          </div>

          {ticket.formData ? (
            <FormAnswers className="mt-4" formSchema={ticket.formSchema ?? ticket.catalogItem?.formSchema} formData={ticket.formData} />
          ) : null}

          {ticket.attachments.length > 0 ? (
            <AttachmentsCard
              className="mt-4"
              attachments={ticket.attachments}
              target={{ ticketId: ticket.id }}
              canUpload={false}
              canDeleteAll={!!me && isAgent(me.role as Role)}
              currentUserId={me?.id}
            />
          ) : null}

          {/* Linked records (with unlink) */}
          {(ticket.problem || ticket.change || ticket.assets.length > 0 || ticket.linksFrom.length > 0) && (
            <div className="mt-4 flex flex-wrap gap-2">
              {ticket.problem ? (
                <Chip href={`/problems/${ticket.problem.id}`} icon={<AlertTriangle className="size-3.5 text-amber-500" />} label={`${problemRef(ticket.problem.id)} · ${ticket.problem.title}`}
                  unlink={<UnlinkBtn action={unlinkRelation} fields={{ ticketId: ticket.id, kind: "problem" }} />} />
              ) : null}
              {ticket.change ? (
                <Chip href={`/changes/${ticket.change.id}`} icon={<GitPullRequestArrow className="size-3.5 text-primary" />} label={changeRef(ticket.change.id)}
                  unlink={<UnlinkBtn action={unlinkRelation} fields={{ ticketId: ticket.id, kind: "change" }} />} />
              ) : null}
              {ticket.linksFrom.map((l) => (
                <Chip key={l.id} href={`/tickets/${l.linkedTicketId}`} icon={<Link2 className="size-3.5 text-sky-500" />} label={`${ticketRef(l.linked.id, l.linked.type)} · ${l.linked.title}`}
                  unlink={<UnlinkBtn action={unlinkTicket} fields={{ linkId: l.id, ticketId: ticket.id }} />} />
              ))}
              {ticket.assets.map((a) => (
                <Chip key={a.assetId} href={`/assets/${a.assetId}`} icon={<Server className="size-3.5 text-indigo-500" />} label={a.asset.name}
                  unlink={<UnlinkBtn action={unlinkAsset} fields={{ ticketId: ticket.id, assetId: a.assetId }} />} />
              ))}
            </div>
          )}

          {/* Comments & Activity */}
          <div className="mt-8">
            {aiVisible ? (
              <div className="mb-3 flex justify-end">
                <SummarizeButton ticketId={ticket.id} teaser={aiTeaser} />
              </div>
            ) : null}
            <CommentThread
              idField="ticketId"
              entityId={ticket.id}
              comments={comments}
              activity={activity}
              addAction={addTicketComment}
              mentionUsers={options.agents}
              attachTarget={{ ticketId: ticket.id }}
              aiTicketId={aiVisible ? ticket.id : undefined}
              aiTeaser={aiTeaser}
            />
          </div>
        </div>
      </div>

      {/* Sidebar */}
      <aside className="p-4 sm:p-6">
        <Card>
          <CardHeader><CardTitle className="text-sm">Properties</CardTitle></CardHeader>
          <CardContent>
            <TicketProperties ticket={ticket} options={options} aiEnabled={aiVisible} aiTeaser={aiTeaser} />
          </CardContent>
        </Card>

        <Card className="mt-4">
          <CardHeader><CardTitle className="text-sm">Due date</CardTitle></CardHeader>
          <CardContent>
            <DueDatePicker ticketId={ticket.id} dueDate={ticket.dueDate} />
          </CardContent>
        </Card>

        <Card className="mt-4">
          <CardHeader><CardTitle className="flex items-center gap-2 text-sm"><ListChecks className="size-4 text-muted-foreground" /> Tasks</CardTitle></CardHeader>
          <CardContent>
            <TicketTasks ticketId={ticket.id} tasks={ticket.tasks} />
          </CardContent>
        </Card>

        <Card className="mt-4">
          <CardHeader><CardTitle className="text-sm">People</CardTitle></CardHeader>
          <CardContent className="grid gap-3 text-sm">
            <div className="flex items-center justify-between gap-2">
              <span className="text-muted-foreground">Requester</span>
              <span className="flex items-center gap-1.5 font-medium">
                {ticket.requester.isVip ? <VipBadge label={false} /> : null}
                {ticket.requester.name ?? ticket.requester.email}
              </span>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-muted-foreground">Watchers</span>
              <span className="font-medium">{ticket.watchers.length}</span>
            </div>
          </CardContent>
        </Card>

        <Card className="mt-4">
          <CardHeader><CardTitle className="text-sm">Timeline & SLA</CardTitle></CardHeader>
          <CardContent className="grid gap-2.5 text-sm">
            <div className="flex items-center justify-between">
              <span className="text-muted-foreground">SLA status</span>
              <SlaBadge ticket={ticket} />
            </div>
            <Meta label="Created" value={format(ticket.createdAt, "PP p")} />
            {ticket.responseDueAt && !ticket.firstResponseAt ? <Meta label="Respond by" value={format(ticket.responseDueAt, "PP p")} /> : null}
            {ticket.dueAt ? <Meta label="Resolve by" value={format(ticket.dueAt, "PP p")} /> : null}
            {ticket.firstResponseAt ? <Meta label="First response" value={format(ticket.firstResponseAt, "PP p")} /> : null}
            {ticket.resolvedAt ? <Meta label="Resolved" value={format(ticket.resolvedAt, "PP p")} /> : null}
            {ticket.sla ? <Meta label="SLA" value={ticket.sla.name} /> : null}
          </CardContent>
        </Card>

        <WorkLog
          ticketId={ticket.id}
          logs={ticket.worklogs}
          meId={me?.id ?? ""}
          isAdmin={me?.role === "ADMIN"}
        />

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

function Chip({
  href, icon, label, unlink,
}: {
  href: string;
  icon: React.ReactNode;
  label: string;
  unlink: React.ReactNode;
}) {
  return (
    <span className="group/chip inline-flex items-center rounded-lg border text-xs transition-colors hover:border-primary/40">
      <Link href={href} className="inline-flex items-center gap-1.5 py-1 pl-2.5 pr-1.5">
        {icon} {label}
      </Link>
      {unlink}
    </span>
  );
}

function UnlinkBtn({
  action, fields,
}: {
  action: (formData: FormData) => void | Promise<void>;
  fields: Record<string, string | number>;
}) {
  return (
    <form action={action} className="flex">
      {Object.entries(fields).map(([k, v]) => (
        <input key={k} type="hidden" name={k} value={v} />
      ))}
      <button
        type="submit"
        aria-label="Unlink"
        className="mr-1 grid size-5 place-items-center rounded text-muted-foreground opacity-0 transition-opacity hover:text-destructive group-hover/chip:opacity-100"
      >
        <X className="size-3.5" />
      </button>
    </form>
  );
}
