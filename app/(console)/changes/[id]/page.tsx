import Link from "next/link";
import { notFound } from "next/navigation";
import type { Metadata } from "next";
import {
  ArrowLeft, Server, AlertTriangle, Ticket as TicketIcon,
  ClipboardList, RotateCcw, FileText, CheckCircle2, ShieldCheck,
} from "lucide-react";
import { db } from "@/lib/db";
import { getFormOptions } from "@/lib/data/options";
import { LinkButton } from "@/components/link-button";
import { StatusBadge } from "@/components/status-badge";
import { ChangeProperties } from "@/components/changes/change-properties";
import { ApprovalActions } from "@/components/changes/approval-actions";
import { CommentThread } from "@/components/comments/comment-thread";
import { EditEntityDialog } from "@/components/edit-entity-dialog";
import { addChangeComment, updateChangeDetails } from "@/lib/actions/changes";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  CHANGE_STATUS_META, CHANGE_TYPE_META, RISK_META, PRIORITY_META, APPROVAL_META,
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

function initials(s: string) {
  return s.split(" ").map((p) => p[0]).slice(0, 2).join("").toUpperCase();
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

  const comments = change.comments.map((c) => ({
    id: c.id, author: c.author.name ?? c.author.email, body: c.body, isInternal: c.isInternal, createdAt: c.createdAt,
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
            <EditEntityDialog
              action={updateChangeDetails}
              idField="id"
              id={change.id}
              title={change.title}
              description={change.description}
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

          <div className="mt-4 rounded-xl border bg-card p-4 text-sm leading-relaxed whitespace-pre-wrap">
            {change.description || <span className="text-muted-foreground">No description provided.</span>}
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

          {/* Approvals */}
          <div className="mt-8">
            <h2 className="mb-4 flex items-center gap-2 text-sm font-semibold">
              <ShieldCheck className="size-4 text-muted-foreground" />
              Approvals · {change.approvals.length}
            </h2>
            <div className="grid gap-3">
              {change.approvals.map((a) => (
                <div key={a.id} className="rounded-xl border bg-card p-3">
                  <div className="flex items-center gap-3">
                    <Avatar className="size-8 shrink-0">
                      <AvatarFallback className="text-xs">
                        {initials(a.approver.name ?? a.approver.email)}
                      </AvatarFallback>
                    </Avatar>
                    <div className="min-w-0 flex-1">
                      <div className="text-sm font-medium">
                        {a.approver.name ?? a.approver.email}
                      </div>
                      {a.decidedAt ? (
                        <div className="text-xs text-muted-foreground">
                          Decided {formatDistanceToNow(a.decidedAt, { addSuffix: true })}
                        </div>
                      ) : (
                        <div className="text-xs text-muted-foreground">Awaiting decision</div>
                      )}
                    </div>
                    <StatusBadge map={APPROVAL_META} value={a.status} />
                  </div>
                  {a.comment ? (
                    <p className="mt-2 rounded-lg border bg-muted/30 p-2 text-xs text-muted-foreground whitespace-pre-wrap">
                      {a.comment}
                    </p>
                  ) : null}
                  {a.status === "PENDING" ? <ApprovalActions approvalId={a.id} /> : null}
                </div>
              ))}
              {change.approvals.length === 0 ? (
                <div className="flex items-center gap-2 rounded-xl border border-dashed bg-card/50 px-4 py-6 text-sm text-muted-foreground">
                  <CheckCircle2 className="size-4" />
                  No approvers assigned to this change yet.
                </div>
              ) : null}
            </div>
          </div>

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
