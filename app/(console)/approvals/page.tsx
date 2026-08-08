import Link from "next/link";
import type { Metadata } from "next";
import { CheckSquare, User } from "lucide-react";
import { db } from "@/lib/db";
import { requireUser } from "@/lib/session";
import { PageHeader, PageBody } from "@/components/page-header";
import { EmptyState } from "@/components/empty-state";
import { VipBadge } from "@/components/status-badge";
import { ApprovalDecision } from "@/components/approvals/approval-decision";
import { Card, CardContent } from "@/components/ui/card";
import { parseFormSchema, answersToText } from "@/lib/service-forms";
import { ticketRef } from "@/lib/constants";
import { formatDistanceToNow } from "date-fns";

export const metadata: Metadata = { title: "Approvals" };
export const dynamic = "force-dynamic";

export default async function ApprovalsPage() {
  const me = await requireUser();
  const pending = await db.ticketApproval.findMany({
    where: {
      status: "PENDING",
      ...(me.role === "ADMIN" ? {} : { approverId: me.id }),
    },
    orderBy: { createdAt: "asc" },
    include: {
      ticket: { include: { requester: true, service: true } },
    },
  });

  return (
    <>
      <PageHeader
        icon={CheckSquare}
        title="Approvals"
        description="Requests waiting for your decision."
      />
      <PageBody className="grid gap-4">
        {pending.length === 0 ? (
          <EmptyState
            icon={CheckSquare}
            title="Nothing to approve"
            description="You're all caught up — approval requests will appear here."
          />
        ) : (
          pending.map((a) => {
            const t = a.ticket;
            const fields = parseFormSchema(t.service?.formSchema);
            let answers = "";
            try {
              answers = answersToText(fields, JSON.parse(t.formData ?? "{}"));
            } catch {
              answers = "";
            }
            return (
              <Card key={a.id}>
                <CardContent className="grid gap-3 pt-6 sm:grid-cols-[1fr_auto] sm:items-start">
                  <div className="min-w-0">
                    <div className="flex items-center gap-2">
                      <Link href={`/tickets/${t.id}`} className="font-mono text-xs text-muted-foreground hover:text-foreground">
                        {ticketRef(t.id, t.type)}
                      </Link>
                      <span className="font-medium">{t.service?.name ?? t.title}</span>
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
          })
        )}
      </PageBody>
    </>
  );
}
