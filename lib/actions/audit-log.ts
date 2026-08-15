// Server-only query helpers (imported by the /audit server component and the
// export route handler — not invoked from client components, so no "use server").
import type { Prisma } from "@prisma/client";
import { db } from "@/lib/db";
import { requireRole } from "@/lib/session";

/** One row as surfaced to the UI / export (actor flattened to name + email). */
export type AuditLogRow = {
  id: string;
  createdAt: Date;
  action: string;
  entity: string;
  entityId: string;
  summary: string | null;
  ip: string | null;
  userId: string | null;
  actorName: string | null;
  actorEmail: string | null;
};

export type AuditLogFilters = {
  /** Actor — matches the AuditLog.userId (a User id). */
  userId?: string;
  /** Entity kind, e.g. "Ticket", "Asset". */
  entity?: string;
  /** Action verb, e.g. "CREATE", "UPDATE", "DELETE", "LOGIN". */
  action?: string;
  /** Inclusive lower bound (yyyy-mm-dd or ISO). */
  from?: string;
  /** Inclusive upper bound (yyyy-mm-dd or ISO). */
  to?: string;
  /** Free text — matched against summary / entityId. */
  q?: string;
};

/** How many rows one page of the viewer shows. */
export const AUDIT_PAGE_SIZE = 25;
/** Safety cap on a single export so we never stream the whole table unbounded. */
export const AUDIT_EXPORT_MAX = 10_000;

/**
 * Build the Prisma `where` from the filter set. SQLite (dev) has no
 * case-insensitive `mode`, so free-text uses a plain `contains`.
 */
function buildWhere(filters: AuditLogFilters): Prisma.AuditLogWhereInput {
  const where: Prisma.AuditLogWhereInput = {};

  if (filters.userId) where.userId = filters.userId;
  if (filters.entity) where.entity = filters.entity;
  if (filters.action) where.action = filters.action;

  const createdAt: Prisma.DateTimeFilter = {};
  if (filters.from) {
    const d = new Date(filters.from);
    if (!Number.isNaN(d.getTime())) createdAt.gte = d;
  }
  if (filters.to) {
    const d = new Date(filters.to);
    if (!Number.isNaN(d.getTime())) {
      // Treat a bare date as "end of that day" so `to` is inclusive.
      if (/^\d{4}-\d{2}-\d{2}$/.test(filters.to)) d.setHours(23, 59, 59, 999);
      createdAt.lte = d;
    }
  }
  if (createdAt.gte || createdAt.lte) where.createdAt = createdAt;

  if (filters.q) {
    const q = filters.q.trim();
    if (q) {
      where.OR = [{ summary: { contains: q } }, { entityId: { contains: q } }];
    }
  }

  return where;
}

const ACTOR_SELECT = {
  id: true,
  createdAt: true,
  action: true,
  entity: true,
  entityId: true,
  summary: true,
  ip: true,
  userId: true,
  user: { select: { name: true, email: true } },
} satisfies Prisma.AuditLogSelect;

function flatten(row: {
  id: string;
  createdAt: Date;
  action: string;
  entity: string;
  entityId: string;
  summary: string | null;
  ip: string | null;
  userId: string | null;
  user: { name: string | null; email: string | null } | null;
}): AuditLogRow {
  return {
    id: row.id,
    createdAt: row.createdAt,
    action: row.action,
    entity: row.entity,
    entityId: row.entityId,
    summary: row.summary,
    ip: row.ip,
    userId: row.userId,
    actorName: row.user?.name ?? null,
    actorEmail: row.user?.email ?? null,
  };
}

/**
 * ADMIN-gated, paginated audit query. Returns the page of rows plus the total
 * count and the distinct entity/action facets for the filter dropdowns.
 */
export async function queryAuditLog(
  filters: AuditLogFilters,
  page = 1,
): Promise<{
  rows: AuditLogRow[];
  total: number;
  entities: string[];
  actions: string[];
}> {
  await requireRole("ADMIN");

  const where = buildWhere(filters);
  const safePage = Number.isFinite(page) && page > 0 ? Math.floor(page) : 1;

  const [total, records, entityFacets, actionFacets] = await Promise.all([
    db.auditLog.count({ where }),
    db.auditLog.findMany({
      where,
      select: ACTOR_SELECT,
      orderBy: { createdAt: "desc" },
      skip: (safePage - 1) * AUDIT_PAGE_SIZE,
      take: AUDIT_PAGE_SIZE,
    }),
    db.auditLog.findMany({
      distinct: ["entity"],
      select: { entity: true },
      orderBy: { entity: "asc" },
    }),
    db.auditLog.findMany({
      distinct: ["action"],
      select: { action: true },
      orderBy: { action: "asc" },
    }),
  ]);

  return {
    rows: records.map(flatten),
    total,
    entities: entityFacets.map((e) => e.entity),
    actions: actionFacets.map((a) => a.action),
  };
}

/**
 * ADMIN-gated fetch of every matching audit row (capped) for CSV export.
 * Same filters as the viewer, no pagination. Callers should feed the result
 * straight into `toCsv` / `csvResponse`.
 */
export async function fetchAuditLogForExport(
  filters: AuditLogFilters,
): Promise<AuditLogRow[]> {
  await requireRole("ADMIN");

  const records = await db.auditLog.findMany({
    where: buildWhere(filters),
    select: ACTOR_SELECT,
    orderBy: { createdAt: "desc" },
    take: AUDIT_EXPORT_MAX,
  });

  return records.map(flatten);
}
