import Link from "next/link";
import type { Metadata } from "next";
import { CheckSquare, User, GitPullRequestArrow } from "lucide-react";
import { db } from "@/lib/db";
import { requireUser } from "@/lib/session";
import { PageHeader, PageBody } from "@/components/page-header";
import { EmptyState } from "@/components/empty-state";
import { VipBadge, StatusBadge } from "@/components/status-badge";
import { ApprovalDecision } from "@/components/approvals/approval-decision";
import { ApprovalActions } from "@/components/changes/approval-actions";
import { Card, CardContent } from "@/components/ui/card";
import { parseFormSchema, answersToText } from "@/lib/service-forms";
import { ticketRef, changeRef, CHANGE_TYPE_META, RISK_META } from "@/lib/constants";
import { formatDistanceToNow } from "date-fns";

export const metadata: Metadata = { title: "Approvals" };
export const dynamic = "force-dynamic";

export default async function ApprovalsPage() {
  const me = await requireUser();
  const scope = me.role === "ADMIN" ? {} : { approverId: me.id };
  const [pending, pendingChanges] = await Promise.all([
    db.ticketApproval.findMany({
      where: { status: "PENDING", ...scope },
      orderBy: { createdAt: "asc" },
      include: { ticket: { include: { requester: true, catalogItem: true } } },
    }),
    db.changeApproval.findMany({
      where: { status: "PENDING", ...scope },
      orderBy: { createdAt: "asc" },
      include: { change: { include: { assignee: true } } },
    }),
  ]);

  return (
    <>
      <PageHeader
        icon={CheckSquare}
        title="Approvals"
        description="Requests waiting for your decision."
      />
      <PageBody className="grid gap-4">
        {pending.length === 0 && pendingChanges.length === 0 ? (
          <EmptyState
            icon={CheckSquare}
            title="Nothing to approve"
            description="You're all caught up — approval requests will appear here."
          />
        ) : (
          <>
            {pending.map((a) => {
              const t = a.ticket;
              const fields = parseFormSchema(t.catalogItem?.formSchema);
              let answers = "";
              try {
                answers = answersToText(fields, JSON.parse(t.formData ?? "{}"));
              } catch {
                answers = "";
              }
              return (
                <Card key={a.id}>
                  <CardContent className="grid gap-3 sm:grid-cols-[1fr_auto] sm:items-start">
                    <div className="min-w-0">
                      <div className="flex items-center gap-2">
                        <Link href={`/tickets/${t.id}`} className="font-mono text-xs text-muted-foreground hover:text-foreground">
                          {ticketRef(t.id, t.prefix)}
                        </Link>
                        <span className="font-medium">{t.catalogItem?.name ?? t.title}</span>
                      </div>
                      <p className="mt-1 flex items-center gap-1.5 text-sm text-muted-foreground">
                        <User className="size-3.5" />
                        {t.requester.name ?? t.requester.email}
                        {t.requester.isVip ? <VipBadge label={false} /> : null}
                        <span>· {formatDistanceToNow(a.createdAt, { addSuffix: true })}</span>
                      </p>
                      {answers ? (
                        <pre className="mt-3 whitespace-pre-wrap rounded-lg border bg-muted/40 p-3 text-xs text-foreground/90">
                          {answers}
                        </pre>
                      ) : null}
                    </div>
                    <div className="flex sm:justify-end">
                      <ApprovalDecision approvalId={a.id} />
                    </div>
                  </CardContent>
                </Card>
              );
            })}

            {pendingChanges.length > 0 ? (
              <div className="grid gap-4">
                <h2 className="flex items-center gap-2 pt-2 text-sm font-semibold text-muted-foreground">
                  <GitPullRequestArrow className="size-4" /> Change approvals · {pendingChanges.length}
                </h2>
                {pendingChanges.map((a) => (
                  <Card key={a.id}>
                    <CardContent className="grid gap-2">
                      <div className="flex flex-wrap items-center gap-2">
                        <Link href={`/changes/${a.change.id}`} className="font-mono text-xs text-muted-foreground hover:text-foreground">
                          {changeRef(a.change.id)}
                        </Link>
                        <span className="font-medium">{a.change.title}</span>
                        <StatusBadge map={CHANGE_TYPE_META} value={a.change.type} dot />
                        <StatusBadge map={RISK_META} value={a.change.risk} dot />
                      </div>
                      <p className="flex items-center gap-1.5 text-sm text-muted-foreground">
                        <User className="size-3.5" />
                        {a.change.assignee ? (a.change.assignee.name ?? a.change.assignee.email) : "Unassigned"}
                        <span>· {formatDistanceToNow(a.createdAt, { addSuffix: true })}</span>
                      </p>
                      <ApprovalActions approvalId={a.id} />
                    </CardContent>
                  </Card>
                ))}
              </div>
            ) : null}
          </>
        )}
      </PageBody>
    </>
  );
}
