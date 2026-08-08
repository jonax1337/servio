import Link from "next/link";
import { notFound } from "next/navigation";
import type { Metadata } from "next";
import {
  ArrowLeft, Ticket as TicketIcon, GitPullRequestArrow, Search, ShieldCheck,
} from "lucide-react";
import { db } from "@/lib/db";
import { getFormOptions } from "@/lib/data/options";
import { LinkButton } from "@/components/link-button";
import { StatusBadge } from "@/components/status-badge";
import { ProblemProperties } from "@/components/problems/problem-properties";
import { CommentThread } from "@/components/comments/comment-thread";
import { EditEntityDialog } from "@/components/edit-entity-dialog";
import { addProblemComment, updateProblemDetails } from "@/lib/actions/problems";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  PROBLEM_STATUS_META, PRIORITY_META, TICKET_STATUS_META,
  problemRef, ticketRef, changeRef,
} from "@/lib/constants";
import { format, formatDistanceToNow } from "date-fns";

export const dynamic = "force-dynamic";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ id: string }>;
}): Promise<Metadata> {
  const { id } = await params;
  const p = await db.problem.findUnique({ where: { id: Number(id) }, select: { title: true } });
  return { title: p ? p.title : "Problem" };
}

export default async function ProblemDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const problemId = Number(id);
  if (!Number.isFinite(problemId)) notFound();

  const [problem, options, audits] = await Promise.all([
    db.problem.findUnique({
      where: { id: problemId },
      include: {
        assignee: true,
        group: true,
        category: true,
        tickets: { include: { assignee: true }, orderBy: { createdAt: "desc" } },
        changes: { orderBy: { createdAt: "desc" } },
        comments: { include: { author: true }, orderBy: { createdAt: "asc" } },
      },
    }),
    getFormOptions(),
    db.auditLog.findMany({
      where: { entity: "Problem", entityId: String(problemId) },
      include: { user: true },
      orderBy: { createdAt: "asc" },
    }),
  ]);
  if (!problem) notFound();

  const comments = problem.comments.map((c) => ({
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
          <LinkButton href="/problems" variant="ghost" size="icon-sm">
            <ArrowLeft className="size-4" />
          </LinkButton>
          <span className="font-mono text-sm text-muted-foreground">
            {problemRef(problem.id)}
          </span>
          <div className="ml-auto flex items-center gap-2">
            <StatusBadge map={PRIORITY_META} value={problem.priority} dot />
            <StatusBadge map={PROBLEM_STATUS_META} value={problem.status} />
            <EditEntityDialog
              action={updateProblemDetails}
              idField="id"
              id={problem.id}
              title={problem.title}
              description={problem.description}
              entityLabel="problem"
            />
          </div>
        </div>

        <div className="p-4 sm:p-6">
          <h1 className="font-display text-2xl font-semibold tracking-tight">
            {problem.title}
          </h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Opened {formatDistanceToNow(problem.createdAt, { addSuffix: true })}
            {problem.category ? <> · {problem.category.name}</> : null}
          </p>

          <div className="mt-4 rounded-xl border bg-card p-4 text-sm leading-relaxed whitespace-pre-wrap">
            {problem.description || <span className="text-muted-foreground">No description provided.</span>}
          </div>

          <div className="mt-4 grid gap-4 sm:grid-cols-2">
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2 text-sm">
                  <Search className="size-4 text-muted-foreground" /> Root cause
                </CardTitle>
              </CardHeader>
              <CardContent className="text-sm leading-relaxed whitespace-pre-wrap">
                {problem.rootCause || <span className="text-muted-foreground">Not yet identified.</span>}
              </CardContent>
            </Card>
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2 text-sm">
                  <ShieldCheck className="size-4 text-muted-foreground" /> Workaround
                </CardTitle>
              </CardHeader>
              <CardContent className="text-sm leading-relaxed whitespace-pre-wrap">
                {problem.workaround || <span className="text-muted-foreground">No workaround documented.</span>}
              </CardContent>
            </Card>
          </div>

          {/* Linked incidents */}
          <div className="mt-8">
            <h2 className="mb-4 flex items-center gap-2 text-sm font-semibold">
              <TicketIcon className="size-4 text-muted-foreground" />
              Linked incidents · {problem.tickets.length}
            </h2>
            {problem.tickets.length === 0 ? (
              <p className="text-sm text-muted-foreground">No incidents linked to this problem yet.</p>
            ) : (
              <div className="overflow-hidden rounded-xl border bg-card">
                {problem.tickets.map((t) => (
                  <Link
                    key={t.id}
                    href={`/tickets/${t.id}`}
                    className="flex items-center gap-3 border-b px-4 py-3 last:border-b-0 hover:bg-accent"
                  >
                    <span className="font-mono text-xs text-muted-foreground">
                      {ticketRef(t.id, t.type)}
                    </span>
                    <span className="line-clamp-1 flex-1 text-sm font-medium">{t.title}</span>
                    <StatusBadge map={TICKET_STATUS_META} value={t.status} />
                  </Link>
                ))}
              </div>
            )}
          </div>

          {/* Linked changes */}
          {problem.changes.length > 0 ? (
            <div className="mt-4 flex flex-wrap gap-2">
              {problem.changes.map((c) => (
                <Link
                  key={c.id}
                  href={`/changes/${c.id}`}
                  className="inline-flex items-center gap-1.5 rounded-lg border px-2.5 py-1 text-xs hover:border-primary/40"
                >
                  <GitPullRequestArrow className="size-3.5 text-primary" /> {changeRef(c.id)} · {c.title}
                </Link>
              ))}
            </div>
          ) : null}

          {/* Comments & Activity */}
          <div className="mt-8">
            <CommentThread
              idField="problemId"
              entityId={problem.id}
              comments={comments}
              activity={activity}
              addAction={addProblemComment}
            />
          </div>
        </div>
      </div>

      {/* Sidebar */}
      <aside className="p-4 sm:p-6">
        <Card>
          <CardHeader><CardTitle className="text-sm">Properties</CardTitle></CardHeader>
          <CardContent>
            <ProblemProperties problem={problem} options={options} />
          </CardContent>
        </Card>

        <Card className="mt-4">
          <CardHeader><CardTitle className="text-sm">Assignment</CardTitle></CardHeader>
          <CardContent className="grid gap-3 text-sm">
            <div className="flex items-center justify-between">
              <span className="text-muted-foreground">Assignee</span>
              <span className="font-medium">
                {problem.assignee ? (problem.assignee.name ?? problem.assignee.email) : "Unassigned"}
              </span>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-muted-foreground">Group</span>
              <span className="font-medium">{problem.group ? problem.group.name : "—"}</span>
            </div>
          </CardContent>
        </Card>

        <Card className="mt-4">
          <CardHeader><CardTitle className="text-sm">Timeline</CardTitle></CardHeader>
          <CardContent className="grid gap-2.5 text-sm">
            <Meta label="Created" value={format(problem.createdAt, "PP p")} />
            <Meta label="Updated" value={format(problem.updatedAt, "PP p")} />
            {problem.resolvedAt ? <Meta label="Resolved" value={format(problem.resolvedAt, "PP p")} /> : null}
          </CardContent>
        </Card>
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
