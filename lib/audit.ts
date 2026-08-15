import { db } from "@/lib/db";
import { headers } from "next/headers";

/**
 * Best-effort client IP from the request headers. Returns null outside a request
 * scope (the scheduler / sync sweeps run with no request), so it never throws.
 */
async function requestIp(): Promise<string | null> {
  try {
    const h = await headers();
    const fwd = h.get("x-forwarded-for");
    return (fwd ? fwd.split(",")[0]?.trim() : null) || h.get("x-real-ip") || null;
  } catch {
    return null;
  }
}

export async function writeAudit(input: {
  userId?: string | null;
  action: string;
  entity: string;
  entityId: string | number;
  summary?: string;
  meta?: Record<string, unknown>;
  /** Explicit IP; when omitted it's captured from the request headers if available. */
  ip?: string | null;
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
        ip: input.ip ?? (await requestIp()),
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
