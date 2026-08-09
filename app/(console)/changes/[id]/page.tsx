import Link from "next/link";
import { notFound } from "next/navigation";
import type { Metadata } from "next";
import {
  ArrowLeft, Server, AlertTriangle, Ticket as TicketIcon,
  ClipboardList, RotateCcw, FileText,
} from "lucide-react";
import { db } from "@/lib/db";
import { getFormOptions } from "@/lib/data/options";
import { getSessionUser, isAgent, hasRole, type Role } from "@/lib/session";
import { LinkButton } from "@/components/link-button";
import { StatusBadge } from "@/components/status-badge";
import { ChangeProperties } from "@/components/changes/change-properties";
import { SubmitForApproval } from "@/components/changes/submit-for-approval";
import { ApprovalPanel, type ApprovalRow } from "@/components/changes/approval-panel";
import { CommentThread } from "@/components/comments/comment-thread";
import { EditEntityDialog } from "@/components/edit-entity-dialog";
import { addChangeComment, updateChangeDetails } from "@/lib/actions/changes";
import { sanitizeCommentHtml } from "@/lib/markdown";
import { initials } from "@/lib/avatar";
import type { ComboOption } from "@/components/combobox";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  CHANGE_STATUS_META, CHANGE_TYPE_META, RISK_META, PRIORITY_META,
  changeRef, problemRef, ticketRef,
} from "@/lib/constants";
import { format, formatDistanceToNow } from "date-fns";

export const dynamic = "force-dynamic";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ id: string }>;
}): Promise<Metadata> {
  const { id } = await params;
  const c = await db.change.findUnique({ where: { id: Number(id) }, select: { title: true } });
  return { title: c ? c.title : "Change" };
}

export default async function ChangeDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const changeId = Number(id);
  if (!Number.isFinite(changeId)) notFound();

  const [change, options, audits] = await Promise.all([
    db.change.findUnique({
      where: { id: changeId },
      include: {
        assignee: true,
        problem: true,
        approvals: { include: { approver: true }, orderBy: { createdAt: "asc" } },
        assets: { include: { asset: true } },
        tickets: true,
        comments: { include: { author: true }, orderBy: { createdAt: "asc" } },
      },
    }),
    getFormOptions(),
    db.auditLog.findMany({
      where: { entity: "Change", entityId: String(changeId) },
      include: { user: true },
      orderBy: { createdAt: "asc" },
    }),
  ]);
  if (!change) notFound();

  const me = await getSessionUser();
  // Manager+ curate the approval board (not the owner — SoD, matches the server).
  const canManage = !!me && hasRole(me.role as Role, "MANAGER");
  const isAgentUser = !!me && isAgent(me.role as Role);
  const approverIds = new Set(change.approvals.map((a) => a.approverId));
  const agentOptions: ComboOption[] = options.agents
    .filter((a) => !approverIds.has(a.id) && a.id !== change.assigneeId)
    .map((a) => ({ value: a.id, label: a.name ?? a.email, avatar: initials(a.name ?? a.email), hint: a.email }));
  const approvalRows: ApprovalRow[] = change.approvals.map((a) => ({
    id: a.id,
    approver: { id: a.approver.id, name: a.approver.name, email: a.approver.email },
    status: a.status,
    comment: a.comment,
    decidedAt: a.decidedAt,
  }));

  const comments = change.comments.map((c) => ({
    id: c.id, author: c.author.name ?? c.author.email, body: c.body, bodyHtml: c.bodyHtml, isInternal: c.isInternal, createdAt: c.createdAt, attachments: [],
  }));
  const activity = audits
    .filter((a) => a.summary && a.summary !== "Added a comment")
    .map((a) => ({ id: a.id, who: a.user?.name ?? "System", summary: a.summary!, createdAt: a.createdAt }));

  return (
    <div className="grid gap-0 lg:grid-cols-[1fr_320px]">
      {/* Main column */}
      <div className="min-w-0 border-b lg:border-b-0 lg:border-r">
        <div className="flex items-center gap-3 border-b px-4 py-3 sm:px-6">
          <LinkButton href="/changes" variant="ghost" size="icon-sm">
            <ArrowLeft className="size-4" />
          </LinkButton>
          <span className="font-mono text-sm text-muted-foreground">
            {changeRef(change.id)}
          </span>
          <StatusBadge map={CHANGE_TYPE_META} value={change.type} dot />
          <div className="ml-auto flex items-center gap-2">
            {isAgentUser && change.status === "DRAFT" ? (
              <SubmitForApproval
                changeId={change.id}
                isStandard={change.type === "STANDARD"}
                approverCount={change.approvals.length}
              />
            ) : null}
            <EditEntityDialog
              action={updateChangeDetails}
              idField="id"
              id={change.id}
              title={change.title}
              description={change.description}
              descriptionHtml={change.descriptionHtml}
              entityLabel="change"
            />
            <StatusBadge map={RISK_META} value={change.risk} dot />
            <StatusBadge map={CHANGE_STATUS_META} value={change.status} />
          </div>
        </div>

        <div className="p-4 sm:p-6">
          <h1 className="font-display text-2xl font-semibold tracking-tight">
            {change.title}
          </h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Raised {formatDistanceToNow(change.createdAt, { addSuffix: true })}
            {change.assignee ? <> · owned by {change.assignee.name ?? change.assignee.email}</> : null}
          </p>

          <div className="mt-4 rounded-xl border bg-card p-4 text-sm leading-relaxed">
            {change.descriptionHtml ? (
              <div className="prose prose-sm dark:prose-invert max-w-none" dangerouslySetInnerHTML={{ __html: sanitizeCommentHtml(change.descriptionHtml) }} />
            ) : change.description ? (
              <div className="whitespace-pre-wrap">{change.description}</div>
            ) : (
              <span className="text-muted-foreground">No description provided.</span>
            )}
          </div>

          {/* Plan cards */}
          <div className="mt-4 grid gap-4">
            <PlanCard icon={FileText} title="Reason for change" body={change.reason} />
            <PlanCard icon={ClipboardList} title="Implementation plan" body={change.implementationPlan} />
            <PlanCard icon={RotateCcw} title="Rollback plan" body={change.rollbackPlan} />
          </div>

          {/* Linked records */}
          {(change.problem || change.tickets.length > 0 || change.assets.length > 0) && (
            <div className="mt-4 flex flex-wrap gap-2">
              {change.problem ? (
                <Link href={`/problems/${change.problem.id}`} className="inline-flex items-center gap-1.5 rounded-lg border px-2.5 py-1 text-xs hover:border-primary/40">
                  <AlertTriangle className="size-3.5 text-amber-500" /> {problemRef(change.problem.id)} · {change.problem.title}
                </Link>
              ) : null}
              {change.tickets.map((t) => (
                <Link key={t.id} href={`/tickets/${t.id}`} className="inline-flex items-center gap-1.5 rounded-lg border px-2.5 py-1 text-xs hover:border-primary/40">
                  <TicketIcon className="size-3.5 text-primary" /> {ticketRef(t.id, t.type)}
                </Link>
              ))}
              {change.assets.map((a) => (
                <Link key={a.assetId} href={`/assets/${a.assetId}`} className="inline-flex items-center gap-1.5 rounded-lg border px-2.5 py-1 text-xs hover:border-primary/40">
                  <Server className="size-3.5 text-indigo-500" /> {a.asset.name}
                </Link>
              ))}
            </div>
          )}

          {/* Approvals / CAB */}
          <ApprovalPanel
            changeId={change.id}
            changeType={change.type}
            changeStatus={change.status}
            approvals={approvalRows}
            currentUserId={me?.id ?? ""}
            canManage={canManage}
            agentOptions={agentOptions}
          />

          {/* Affected assets */}
          {change.assets.length > 0 ? (
            <div className="mt-8">
              <h2 className="mb-4 flex items-center gap-2 text-sm font-semibold">
                <Server className="size-4 text-muted-foreground" />
                Affected assets · {change.assets.length}
              </h2>
              <div className="overflow-hidden rounded-xl border bg-card">
                {change.assets.map((a) => (
                  <Link
                    key={a.assetId}
                    href={`/assets/${a.assetId}`}
                    className="flex items-center justify-between gap-3 border-b px-4 py-2.5 text-sm last:border-b-0 hover:bg-muted/40"
                  >
                    <span className="flex items-center gap-2 font-medium">
                      <Server className="size-4 text-indigo-500" />
                      {a.asset.name}
                    </span>
                    <span className="text-xs text-muted-foreground">{a.asset.type}</span>
                  </Link>
                ))}
              </div>
            </div>
          ) : null}

          {/* Comments & Activity */}
          <div className="mt-8">
            <CommentThread
              idField="changeId"
              entityId={change.id}
              comments={comments}
              activity={activity}
              addAction={addChangeComment}
            />
          </div>
        </div>
      </div>

      {/* Sidebar */}
      <aside className="p-4 sm:p-6">
        <Card>
          <CardHeader><CardTitle className="text-sm">Properties</CardTitle></CardHeader>
          <CardContent>
            <ChangeProperties change={change} options={options} />
          </CardContent>
        </Card>

        <Card className="mt-4">
          <CardHeader><CardTitle className="text-sm">Planned window</CardTitle></CardHeader>
          <CardContent className="grid gap-2.5 text-sm">
            <Meta label="Priority" value={PRIORITY_META[change.priority]?.label ?? change.priority} />
            <Meta label="Planned start" value={change.plannedStart ? format(change.plannedStart, "PP p") : "—"} />
            <Meta label="Planned end" value={change.plannedEnd ? format(change.plannedEnd, "PP p") : "—"} />
            {change.actualStart ? <Meta label="Actual start" value={format(change.actualStart, "PP p")} /> : null}
            {change.actualEnd ? <Meta label="Actual end" value={format(change.actualEnd, "PP p")} /> : null}
            <Meta label="Created" value={format(change.createdAt, "PP p")} />
          </CardContent>
        </Card>
      </aside>
    </div>
  );
}

function PlanCard({
  icon: Icon, title, body,
}: {
  icon: typeof FileText;
  title: string;
  body: string | null;
}) {
  return (
    <div className="rounded-xl border bg-card p-4">
      <h3 className="mb-2 flex items-center gap-2 text-sm font-semibold">
        <Icon className="size-4 text-muted-foreground" />
        {title}
      </h3>
      <p className="text-sm leading-relaxed whitespace-pre-wrap text-muted-foreground">
        {body || "Not documented yet."}
      </p>
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
