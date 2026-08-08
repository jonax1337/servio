import { db } from "@/lib/db";

export async function writeAudit(input: {
  userId?: string | null;
  action: string;
  entity: string;
  entityId: string | number;
  summary?: string;
  meta?: Record<string, unknown>;
}) {
  try {
    await db.auditLog.create({
      data: {
        userId: input.userId ?? null,
        action: input.action,
        entity: input.entity,
        entityId: String(input.entityId),
        summary: input.summary,
        meta: JSON.stringify(input.meta ?? {}),
      },
    });
  } catch {
    // audit failures should never break the main action
  }
}

export async function notify(
  userId: string,
  n: { type?: string; title: string; body?: string; entity?: string; entityId?: string },
) {
  try {
    await db.notification.create({
      data: {
        userId,
        type: n.type ?? "INFO",
        title: n.title,
        body: n.body,
        entity: n.entity,
        entityId: n.entityId,
      },
    });
  } catch {
    /* noop */
  }
}
