import Link from "next/link";
import {
  Ticket,
  UserX,
  CheckCircle2,
  AlertTriangle,
  GitPullRequestArrow,
  ArrowUpRight,
  Activity,
} from "lucide-react";
import { db } from "@/lib/db";
import { getSessionUser } from "@/lib/session";
import { PageHeader, PageBody } from "@/components/page-header";
import { StatCard } from "@/components/stat-card";
import { VolumeChart, BarRow } from "@/components/charts";
import { StatusBadge } from "@/components/status-badge";
import {
  TICKET_STATUS_META,
  PRIORITY_META,
  SERVICE_STATUS_META,
  PRIORITIES,
  OPEN_TICKET_STATUSES,
  ticketRef,
} from "@/lib/constants";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { LinkButton } from "@/components/link-button";
import { UserAvatar } from "@/components/user-avatar";
import { formatDistanceToNow } from "date-fns";

export const dynamic = "force-dynamic";

function startOfDay(d: Date) {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate());
}

export default async function DashboardPage() {
  const me = await getSessionUser();
  const openStatuses = [...OPEN_TICKET_STATUSES];
  const todayStart = startOfDay(new Date());
  const from = new Date(Date.now() - 13 * 86400000);

  const [
    openCount,
    unassignedCount,
    resolvedToday,
    criticalOpen,
    changesInApproval,
    openProblems,
    recentTickets,
    services,
    priorityCounts,
    volumeTickets,
    upcomingChanges,
    activity,
  ] = await Promise.all([
    db.ticket.count({ where: { status: { in: openStatuses } } }),
    db.ticket.count({ where: { status: { in: openStatuses }, assigneeId: null } }),
    db.ticket.count({ where: { resolvedAt: { gte: todayStart } } }),
    db.ticket.count({ where: { status: { in: openStatuses }, priority: "CRITICAL" } }),
    db.change.count({ where: { status: { in: ["SUBMITTED", "APPROVAL"] } } }),
    db.problem.count({ where: { status: { notIn: ["RESOLVED", "CLOSED"] } } }),
    db.ticket.findMany({
      take: 7,
      orderBy: { createdAt: "desc" },
      include: { assignee: true, requester: true },
    }),
    db.service.findMany({ orderBy: { criticality: "desc" }, take: 6 }),
    Promise.all(
      PRIORITIES.map(async (p) => ({
        priority: p,
        count: await db.ticket.count({
          where: { status: { in: openStatuses }, priority: p },
        }),
      })),
    ),
    db.ticket.findMany({
      where: { OR: [{ createdAt: { gte: from } }, { resolvedAt: { gte: from } }] },
      select: { createdAt: true, resolvedAt: true },
    }),
    db.change.findMany({
      where: { status: { in: ["APPROVED", "SCHEDULED", "IN_PROGRESS"] } },
      orderBy: { plannedStart: "asc" },
      take: 4,
    }),
    db.auditLog.findMany({
      take: 6,
      orderBy: { createdAt: "desc" },
      include: { user: true },
    }),
  ]);

  // build 14-day volume buckets
  const days: { label: string; created: number; resolved: number; key: string }[] = [];
  for (let i = 13; i >= 0; i--) {
    const d = startOfDay(new Date(Date.now() - i * 86400000));
    days.push({
      key: d.toISOString().slice(0, 10),
      label: d.toLocaleDateString("en-US", { month: "short", day: "numeric" }),
      created: 0,
      resolved: 0,
    });
  }
  const idx = new Map(days.map((d, i) => [d.key, i]));
  for (const t of volumeTickets) {
    const ck = startOfDay(t.createdAt).toISOString().slice(0, 10);
    if (idx.has(ck)) days[idx.get(ck)!].created++;
    if (t.resolvedAt) {
      const rk = startOfDay(t.resolvedAt).toISOString().slice(0, 10);
      if (idx.has(rk)) days[idx.get(rk)!].resolved++;
    }
  }

  const totalOpenByPrio = priorityCounts.reduce((a, b) => a + b.count, 0);

  return (
    <>
      <PageHeader
        title={`Good ${greeting()}, ${me?.name?.split(" ")[0] ?? "there"}`}
        description="Here's what's happening across your service desk today."
      >
        <LinkButton href="/queues" variant="outline">
          Open queues
        </LinkButton>
        <LinkButton href="/tickets/new">New ticket</LinkButton>
      </PageHeader>

      <PageBody className="grid gap-6">
        <div className="grid grid-cols-2 gap-4 lg:grid-cols-5">
          <StatCard label="Open tickets" value={openCount} icon={Ticket} href="/tickets?status=open" />
          <StatCard label="Unassigned" value={unassignedCount} icon={UserX} tone="warning" href="/tickets?assignee=unassigned" />
          <StatCard label="Critical open" value={criticalOpen} icon={AlertTriangle} tone="danger" href="/tickets?priority=CRITICAL" />
          <StatCard label="Resolved today" value={resolvedToday} icon={CheckCircle2} tone="success" />
          <StatCard label="Changes to approve" value={changesInApproval} icon={GitPullRequestArrow} tone="primary" href="/changes?status=APPROVAL" />
        </div>

        <div className="grid gap-6 lg:grid-cols-3">
          <Card className="lg:col-span-2">
            <CardHeader className="flex-row items-center justify-between">
              <CardTitle>Ticket volume · last 14 days</CardTitle>
              <div className="flex items-center gap-4 text-xs text-muted-foreground">
                <span className="flex items-center gap-1.5">
                  <span className="size-2 rounded-full" style={{ background: "var(--chart-1)" }} /> Created
                </span>
                <span className="flex items-center gap-1.5">
                  <span className="size-2 rounded-full" style={{ background: "var(--chart-4)" }} /> Resolved
                </span>
              </div>
            </CardHeader>
            <CardContent>
              <VolumeChart data={days.map(({ label, created, resolved }) => ({ label, created, resolved }))} />
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Open by priority</CardTitle>
            </CardHeader>
            <CardContent className="grid gap-3.5">
              {priorityCounts.map((p) => (
                <BarRow
                  key={p.priority}
                  label={PRIORITY_META[p.priority].label}
                  value={p.count}
                  total={totalOpenByPrio}
                  colorVar={
                    p.priority === "CRITICAL"
                      ? "var(--destructive)"
                      : p.priority === "HIGH"
                        ? "oklch(0.72 0.16 70)"
                        : p.priority === "MEDIUM"
                          ? "var(--chart-3)"
                          : "var(--muted-foreground)"
                  }
                />
              ))}
              <div className="mt-1 flex items-center justify-between border-t pt-3 text-sm">
                <span className="text-muted-foreground">Open problems</span>
                <Link href="/problems" className="font-medium text-primary hover:underline">
                  {openProblems} active
                </Link>
              </div>
            </CardContent>
          </Card>
        </div>

        <div className="grid gap-6 lg:grid-cols-3">
          <Card className="lg:col-span-2">
            <CardHeader className="flex-row items-center justify-between">
              <CardTitle>Recent tickets</CardTitle>
              <LinkButton href="/tickets" variant="ghost" size="sm">
                View all <ArrowUpRight className="size-4" />
              </LinkButton>
            </CardHeader>
            <CardContent className="p-0">
              <ul className="divide-y">
                {recentTickets.map((t) => (
                  <li key={t.id}>
                    <Link
                      href={`/tickets/${t.id}`}
                      className="flex items-center gap-3 px-6 py-3 transition-colors hover:bg-muted/50"
                    >
                      <span className="w-16 shrink-0 font-mono text-xs text-muted-foreground">
                        {ticketRef(t.id, t.type)}
                      </span>
                      <span className="min-w-0 flex-1 truncate text-sm font-medium">
                        {t.title}
                      </span>
                      <StatusBadge map={PRIORITY_META} value={t.priority} dot />
                      <StatusBadge map={TICKET_STATUS_META} value={t.status} />
                      <span className="hidden w-24 shrink-0 truncate text-right text-xs text-muted-foreground sm:block">
                        {formatDistanceToNow(t.createdAt, { addSuffix: true })}
                      </span>
                    </Link>
                  </li>
                ))}
              </ul>
            </CardContent>
          </Card>

          <div className="grid gap-6">
            <Card>
              <CardHeader className="flex-row items-center justify-between">
                <CardTitle>Service status</CardTitle>
                <Link href="/services" className="text-xs text-primary hover:underline">
                  All services
                </Link>
              </CardHeader>
              <CardContent className="grid gap-2.5">
                {services.map((s) => (
                  <div key={s.id} className="flex items-center justify-between gap-2">
                    <span className="truncate text-sm">{s.name}</span>
                    <StatusBadge map={SERVICE_STATUS_META} value={s.status} />
                  </div>
                ))}
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="flex-row items-center gap-2">
                <Activity className="size-4 text-muted-foreground" />
                <CardTitle>Activity</CardTitle>
              </CardHeader>
              <CardContent className="grid gap-3">
                {activity.map((a) => (
                  <div key={a.id} className="flex items-start gap-2.5 text-sm">
                    <UserAvatar
                      name={a.user?.name ?? "System"}
                      email={a.user?.email}
                      size="sm"
                    />
                    <div className="min-w-0 leading-tight">
                      <p className="truncate">
                        <span className="font-medium">{a.user?.name ?? "System"}</span>{" "}
                        <span className="text-muted-foreground">
                          {a.summary?.toLowerCase() ?? a.action.toLowerCase()} · {a.entity}
                        </span>
                      </p>
                      <p className="text-xs text-muted-foreground">
                        {formatDistanceToNow(a.createdAt, { addSuffix: true })}
                      </p>
                    </div>
                  </div>
                ))}
              </CardContent>
            </Card>
          </div>
        </div>

        {upcomingChanges.length > 0 ? (
          <Card>
            <CardHeader>
              <CardTitle>Upcoming changes</CardTitle>
            </CardHeader>
            <CardContent className="grid gap-2 sm:grid-cols-2">
              {upcomingChanges.map((c) => (
                <Link
                  key={c.id}
                  href={`/changes/${c.id}`}
                  className="flex items-center justify-between rounded-lg border px-3 py-2 text-sm transition-colors hover:border-primary/40"
                >
                  <span className="truncate">{c.title}</span>
                  <span className="shrink-0 text-xs text-muted-foreground">
                    {c.plannedStart
                      ? new Date(c.plannedStart).toLocaleDateString()
                      : "TBD"}
                  </span>
                </Link>
              ))}
            </CardContent>
          </Card>
        ) : null}
      </PageBody>
    </>
  );
}

function greeting() {
  const h = new Date().getHours();
  if (h < 12) return "morning";
  if (h < 18) return "afternoon";
  return "evening";
}
