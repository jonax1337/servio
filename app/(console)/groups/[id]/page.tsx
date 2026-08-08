import Link from "next/link";
import { notFound } from "next/navigation";
import type { Metadata } from "next";
import { ArrowLeft, Users, Inbox, Mail, Ticket as TicketIcon } from "lucide-react";
import { db } from "@/lib/db";
import { LinkButton } from "@/components/link-button";
import { StatusBadge } from "@/components/status-badge";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { StatCard } from "@/components/stat-card";
import { GROUP_TYPE_META, OPEN_TICKET_STATUSES } from "@/lib/constants";

export const dynamic = "force-dynamic";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ id: string }>;
}): Promise<Metadata> {
  const { id } = await params;
  const g = await db.group.findUnique({ where: { id }, select: { name: true } });
  return { title: g ? g.name : "Group" };
}

function initials(s: string) {
  return s.split(" ").map((p) => p[0]).slice(0, 2).join("").toUpperCase();
}

export default async function GroupDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;

  const group = await db.group.findUnique({
    where: { id },
    include: {
      manager: true,
      members: { include: { user: true }, orderBy: { role: "asc" } },
      queues: { orderBy: { order: "asc" } },
    },
  });
  if (!group) notFound();

  const openTickets = await db.ticket.count({
    where: { groupId: group.id, status: { in: [...OPEN_TICKET_STATUSES] } },
  });

  return (
    <>
      <div className="flex items-center gap-3 border-b px-4 py-3 sm:px-6">
        <LinkButton href="/groups" variant="ghost" size="icon-sm">
          <ArrowLeft className="size-4" />
        </LinkButton>
        <span
          className="size-2.5 shrink-0 rounded-full"
          style={{ backgroundColor: group.color }}
        />
        <h1 className="font-display text-lg font-semibold tracking-tight">
          {group.name}
        </h1>
        <StatusBadge map={GROUP_TYPE_META} value={group.type} dot />
      </div>

      <div className="p-4 sm:p-6">
        {group.description ? (
          <p className="mb-6 max-w-2xl text-sm text-muted-foreground">
            {group.description}
          </p>
        ) : null}

        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          <StatCard
            label="Open tickets"
            value={openTickets}
            icon={TicketIcon}
            href={`/tickets?status=open`}
            tone="primary"
          />
          <StatCard label="Members" value={group.members.length} icon={Users} tone="muted" />
          <StatCard label="Queues" value={group.queues.length} icon={Inbox} tone="muted" />
        </div>

        <div className="mt-6 grid gap-4 lg:grid-cols-[1fr_320px]">
          <Card>
            <CardHeader>
              <CardTitle className="text-sm">Members · {group.members.length}</CardTitle>
            </CardHeader>
            <CardContent>
              {group.members.length === 0 ? (
                <p className="text-sm text-muted-foreground">No members yet.</p>
              ) : (
                <div className="grid gap-1">
                  {group.members.map((m) => (
                    <div
                      key={m.id}
                      className="flex items-center gap-3 rounded-lg px-2 py-2 hover:bg-accent/50"
                    >
                      <Avatar className="size-8 shrink-0">
                        <AvatarFallback className="text-xs">
                          {initials(m.user.name ?? m.user.email)}
                        </AvatarFallback>
                      </Avatar>
                      <div className="min-w-0 flex-1">
                        <div className="line-clamp-1 text-sm font-medium">
                          {m.user.name ?? m.user.email}
                        </div>
                        <div className="line-clamp-1 text-xs text-muted-foreground">
                          {m.user.email}
                        </div>
                      </div>
                      <span
                        className={`inline-flex items-center rounded-full border px-2 py-0.5 text-[10px] font-medium ${
                          m.role === "LEAD"
                            ? "border-indigo-500/20 bg-indigo-500/10 text-indigo-600 dark:text-indigo-400"
                            : "border-border bg-muted text-muted-foreground"
                        }`}
                      >
                        {m.role === "LEAD" ? "Lead" : "Member"}
                      </span>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>

          <div className="grid content-start gap-4">
            <Card>
              <CardHeader>
                <CardTitle className="text-sm">Details</CardTitle>
              </CardHeader>
              <CardContent className="grid gap-3 text-sm">
                <div className="flex items-center justify-between gap-2">
                  <span className="text-muted-foreground">Manager</span>
                  <span className="text-right font-medium">
                    {group.manager ? (group.manager.name ?? group.manager.email) : "—"}
                  </span>
                </div>
                <div className="flex items-center justify-between gap-2">
                  <span className="text-muted-foreground">Email</span>
                  {group.email ? (
                    <span className="inline-flex items-center gap-1.5 text-right font-medium">
                      <Mail className="size-3.5" /> {group.email}
                    </span>
                  ) : (
                    <span className="font-medium">—</span>
                  )}
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle className="text-sm">Queues · {group.queues.length}</CardTitle>
              </CardHeader>
              <CardContent>
                {group.queues.length === 0 ? (
                  <p className="text-sm text-muted-foreground">No queues assigned.</p>
                ) : (
                  <div className="grid gap-1.5">
                    {group.queues.map((qq) => (
                      <Link
                        key={qq.id}
                        href={`/queues/${qq.id}`}
                        className="flex items-center gap-2.5 rounded-lg border px-3 py-2 text-sm hover:border-primary/40"
                      >
                        <span
                          className="size-2.5 shrink-0 rounded-full"
                          style={{ backgroundColor: qq.color }}
                        />
                        <span className="line-clamp-1 font-medium">{qq.name}</span>
                        {!qq.isActive ? (
                          <span className="ml-auto text-xs text-muted-foreground">Inactive</span>
                        ) : null}
                      </Link>
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>
          </div>
        </div>
      </div>
    </>
  );
}
