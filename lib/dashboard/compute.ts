import type { Prisma } from "@prisma/client";
import { db } from "@/lib/db";
import {
  OPEN_TICKET_STATUSES,
  PRIORITY_META,
  TICKET_STATUS_META,
  TICKET_TYPE_META,
} from "@/lib/constants";
import type { Widget, Computed, TicketFilters, BreakdownField } from "@/lib/dashboard/types";

/** Turn a widget's filter map into a Prisma ticket `where`. Mirrors /tickets. */
export function buildTicketWhere(f: TicketFilters): Prisma.TicketWhereInput {
  const w: Prisma.TicketWhereInput = {};
  if (f.status === "open") w.status = { in: [...OPEN_TICKET_STATUSES] };
  else if (f.status && f.status !== "all") w.status = f.status;
  if (f.priority && f.priority !== "all") w.priority = f.priority;
  if (f.type && f.type !== "all") w.type = f.type;
  if (f.group && f.group !== "all") w.groupId = f.group;
  if (f.assignee === "unassigned") w.assigneeId = null;
  else if (f.assignee && f.assignee !== "all") w.assigneeId = f.assignee;
  if (f.category && f.category !== "all") w.categoryId = f.category;
  if (f.service && f.service !== "all") w.serviceId = f.service;
  if (f.impact && f.impact !== "all") w.impact = f.impact;
  if (f.urgency && f.urgency !== "all") w.urgency = f.urgency;
  if (f.source && f.source !== "all") w.source = f.source;
  if (f.major === "true") w.isMajorIncident = true;
  if (f.vip === "true") w.requester = { isVip: true };
  // SLA breached = already flagged breached, or an open ticket past its resolve deadline.
  if (f.breached === "true") w.OR = [{ resolveBreached: true }, { resolveDueAt: { lt: new Date() } }];
  return w;
}

function startOfDay(d: Date) {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate());
}

const GROUP_COL: Record<BreakdownField, string> = {
  priority: "priority",
  status: "status",
  type: "type",
  assignee: "assigneeId",
  group: "groupId",
  category: "categoryId",
};

async function computeBreakdown(widget: Widget, where: Prisma.TicketWhereInput): Promise<Computed> {
  const field = widget.options?.groupBy ?? "priority";
  const col = GROUP_COL[field];
  // Dynamic groupBy key — Prisma's types want a literal, so we cast the call.
  const grouped = (await (db.ticket.groupBy as unknown as (args: unknown) => Promise<
    Array<Record<string, unknown> & { _count: { _all: number } }>
  >)({ by: [col], where, _count: { _all: true } }));

  // Resolve human labels for id-based groupings.
  let labelFor: (key: string | null) => string;
  if (field === "priority") labelFor = (k) => (k ? PRIORITY_META[k]?.label ?? k : "—");
  else if (field === "status") labelFor = (k) => (k ? TICKET_STATUS_META[k]?.label ?? k : "—");
  else if (field === "type") labelFor = (k) => (k ? TICKET_TYPE_META[k]?.label ?? k : "—");
  else {
    const ids = grouped.map((g) => g[col]).filter((v): v is string => typeof v === "string");
    const map = new Map<string, string>();
    if (field === "assignee") {
      const users = await db.user.findMany({ where: { id: { in: ids } }, select: { id: true, name: true, email: true } });
      users.forEach((u) => map.set(u.id, u.name ?? u.email));
    } else if (field === "group") {
      const groups = await db.group.findMany({ where: { id: { in: ids } }, select: { id: true, name: true } });
      groups.forEach((g) => map.set(g.id, g.name));
    } else {
      const cats = await db.category.findMany({ where: { id: { in: ids } }, select: { id: true, name: true } });
      cats.forEach((c) => map.set(c.id, c.name));
    }
    labelFor = (k) => (k ? map.get(k) ?? k : field === "assignee" ? "Unassigned" : "None");
  }

  const rows = grouped
    .map((g) => ({ label: labelFor((g[col] as string | null) ?? null), value: g._count._all }))
    .sort((a, b) => b.value - a.value)
    .slice(0, 8);
  return { kind: "breakdown", rows, chartType: widget.options?.chartType ?? "bar" };
}

async function computeVolume(widget: Widget, filters: TicketFilters): Promise<Computed> {
  const days = Math.min(90, Math.max(7, Number(filters.days) || 14));
  // Volume ignores the status filter (we count created & resolved over time).
  const base = buildTicketWhere({ ...filters, status: undefined });
  const from = startOfDay(new Date(Date.now() - (days - 1) * 86400000));
  const rows = await db.ticket.findMany({
    where: { AND: [base, { OR: [{ createdAt: { gte: from } }, { resolvedAt: { gte: from } }] }] },
    select: { createdAt: true, resolvedAt: true },
  });
  const buckets: { label: string; created: number; resolved: number; key: string }[] = [];
  for (let i = days - 1; i >= 0; i--) {
    const d = startOfDay(new Date(Date.now() - i * 86400000));
    buckets.push({
      key: d.toISOString().slice(0, 10),
      label: d.toLocaleDateString("en-US", { month: "short", day: "numeric" }),
      created: 0,
      resolved: 0,
    });
  }
  const idx = new Map(buckets.map((b, i) => [b.key, i]));
  for (const t of rows) {
    const ck = startOfDay(t.createdAt).toISOString().slice(0, 10);
    if (idx.has(ck)) buckets[idx.get(ck)!].created++;
    if (t.resolvedAt) {
      const rk = startOfDay(t.resolvedAt).toISOString().slice(0, 10);
      if (idx.has(rk)) buckets[idx.get(rk)!].resolved++;
    }
  }
  return { kind: "volume", data: buckets.map(({ label, created, resolved }) => ({ label, created, resolved })) };
}

async function computeSla(filters: TicketFilters): Promise<Computed> {
  const days = Math.min(90, Math.max(7, Number(filters.days) || 14));
  const windowStart = new Date(Date.now() - days * 86400000);
  const base = buildTicketWhere({ ...filters, status: undefined });
  const rows = await db.ticket.findMany({
    where: { AND: [base, { resolvedAt: { gte: windowStart } }] },
    select: { createdAt: true, resolvedAt: true, resolveBreached: true },
  });
  const resolved = rows.length;
  if (resolved === 0) return { kind: "sla", pct: null, mttrHours: null, resolved: 0 };
  const met = rows.filter((r) => !r.resolveBreached).length;
  const totalMs = rows.reduce((a, r) => a + (r.resolvedAt!.getTime() - r.createdAt.getTime()), 0);
  return {
    kind: "sla",
    pct: Math.round((met / resolved) * 100),
    mttrHours: Math.round(totalMs / resolved / 3600000),
    resolved,
  };
}

async function computeAging(where: Prisma.TicketWhereInput): Promise<Computed> {
  const rows = await db.ticket.findMany({ where, select: { createdAt: true } });
  const now = Date.now();
  const buckets = [
    { label: "< 1 day", value: 0 },
    { label: "1–3 days", value: 0 },
    { label: "3–7 days", value: 0 },
    { label: "> 7 days", value: 0 },
  ];
  for (const t of rows) {
    const ageD = (now - t.createdAt.getTime()) / 86400000;
    if (ageD < 1) buckets[0].value++;
    else if (ageD < 3) buckets[1].value++;
    else if (ageD < 7) buckets[2].value++;
    else buckets[3].value++;
  }
  return { kind: "aging", rows: buckets };
}

/** Resolve one widget's data. */
export async function computeWidget(widget: Widget): Promise<Computed> {
  const where = buildTicketWhere(widget.filters);
  switch (widget.type) {
    case "stat":
      return { kind: "stat", value: await db.ticket.count({ where }) };
    case "breakdown":
      return computeBreakdown(widget, where);
    case "volume":
      return computeVolume(widget, widget.filters);
    case "sla":
      return computeSla(widget.filters);
    case "aging":
      return computeAging(where);
    case "list": {
      const tickets = await db.ticket.findMany({
        where,
        orderBy: { updatedAt: "desc" },
        take: 6,
        select: { id: true, prefix: true, title: true, status: true, priority: true },
      });
      return { kind: "list", tickets };
    }
    default:
      return { kind: "empty" };
  }
}
