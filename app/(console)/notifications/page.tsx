import Link from "next/link";
import { Bell, Check, CheckCheck } from "lucide-react";
import type { Metadata } from "next";
import { db } from "@/lib/db";
import { getSessionUser } from "@/lib/session";
import { PageHeader, PageBody } from "@/components/page-header";
import { EmptyState } from "@/components/empty-state";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { markAllRead, markRead } from "@/lib/actions/notifications";
import { formatDistanceToNow } from "date-fns";

export const metadata: Metadata = { title: "Notifications" };
export const dynamic = "force-dynamic";

const ENTITY_HREF: Record<string, string> = {
  Ticket: "/tickets",
  Problem: "/problems",
  Change: "/changes",
};

function hrefFor(entity?: string | null, entityId?: string | null) {
  if (!entity || !entityId) return null;
  const base = ENTITY_HREF[entity];
  return base ? `${base}/${entityId}` : null;
}

export default async function NotificationsPage() {
  const me = await getSessionUser();

  const notifications = me
    ? await db.notification.findMany({
        where: { userId: me.id },
        orderBy: { createdAt: "desc" },
      })
    : [];

  const unreadCount = notifications.filter((n) => !n.read).length;

  return (
    <>
      <PageHeader
        icon={Bell}
        title="Notifications"
        description="Updates on the tickets, problems and changes you care about."
      >
        <form action={markAllRead}>
          <Button
            type="submit"
            variant="outline"
            size="sm"
            disabled={unreadCount === 0}
          >
            <CheckCheck className="size-4" /> Mark all as read
          </Button>
        </form>
      </PageHeader>

      <PageBody className="grid gap-4">
        {notifications.length === 0 ? (
          <EmptyState
            icon={Bell}
            title="You're all caught up"
            description="When there's activity on your items, it'll show up here."
          />
        ) : (
          <div className="overflow-hidden rounded-xl border bg-card">
            <ul className="divide-y">
              {notifications.map((n) => {
                const href = hrefFor(n.entity, n.entityId);
                const title = (
                  <span
                    className={cn(
                      "font-medium",
                      !n.read && "text-foreground",
                    )}
                  >
                    {n.title}
                  </span>
                );
                return (
                  <li
                    key={n.id}
                    className={cn(
                      "flex items-start gap-3 px-4 py-3.5 transition-colors sm:px-5",
                      !n.read && "bg-primary/5",
                    )}
                  >
                    <span className="mt-1.5 flex size-2 shrink-0 items-center justify-center">
                      {!n.read ? (
                        <span className="size-2 rounded-full bg-primary" />
                      ) : null}
                    </span>

                    <div className="min-w-0 flex-1">
                      {href ? (
                        <Link href={href} className="hover:text-primary">
                          {title}
                        </Link>
                      ) : (
                        title
                      )}
                      {n.body ? (
                        <p className="mt-0.5 line-clamp-2 text-sm text-muted-foreground">
                          {n.body}
                        </p>
                      ) : null}
                      <p className="mt-1 text-xs text-muted-foreground">
                        {formatDistanceToNow(n.createdAt, { addSuffix: true })}
                      </p>
                    </div>

                    {!n.read ? (
                      <form action={markRead} className="shrink-0">
                        <input type="hidden" name="id" value={n.id} />
                        <Button type="submit" variant="ghost" size="sm">
                          <Check className="size-4" /> Mark read
                        </Button>
                      </form>
                    ) : null}
                  </li>
                );
              })}
            </ul>
          </div>
        )}
      </PageBody>
    </>
  );
}
