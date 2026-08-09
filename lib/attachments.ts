import { db } from "@/lib/db";
import { isAgent, type Role } from "@/lib/session";

export type SessionActor = { id: string; role: Role };

export type UploadTarget =
  | { kind: "ticket"; ticketId: number }
  | { kind: "comment"; commentId: string }
  | { kind: "article"; articleId: string };

type ForeignKey = { ticketId?: number; commentId?: string; articleId?: string };

/**
 * Authorize an upload to a target and return the FK columns to persist, or null
 * on deny OR not-found (the caller maps both to 404 — no existence oracle).
 */
export async function canUploadTo(actor: SessionActor, target: UploadTarget): Promise<ForeignKey | null> {
  const agent = isAgent(actor.role);

  if (target.kind === "ticket") {
    const t = await db.ticket.findUnique({ where: { id: target.ticketId }, select: { requesterId: true, status: true } });
    if (!t) return null;
    if (t.status === "CLOSED" || t.status === "CANCELLED") return null;
    if (agent || t.requesterId === actor.id) return { ticketId: target.ticketId };
    return null;
  }

  if (target.kind === "comment") {
    const c = await db.ticketComment.findUnique({
      where: { id: target.commentId },
      select: { isInternal: true, ticket: { select: { requesterId: true } } },
    });
    if (!c) return null;
    if (agent || (c.ticket.requesterId === actor.id && !c.isInternal)) return { commentId: target.commentId };
    return null;
  }

  // article — agents only
  const a = await db.article.findUnique({ where: { id: target.articleId }, select: { id: true } });
  if (!a) return null;
  if (agent) return { articleId: target.articleId };
  return null;
}

/** Whether an actor (possibly anonymous) may download an attachment. */
export async function canViewAttachment(
  actor: SessionActor | null,
  att: { ticketId: number | null; commentId: string | null; articleId: string | null },
): Promise<boolean> {
  const agent = !!actor && isAgent(actor.role);

  if (att.ticketId != null) {
    if (agent) return true;
    const t = await db.ticket.findUnique({ where: { id: att.ticketId }, select: { requesterId: true } });
    return !!actor && !!t && t.requesterId === actor.id;
  }

  if (att.commentId != null) {
    const c = await db.ticketComment.findUnique({
      where: { id: att.commentId },
      select: { isInternal: true, ticket: { select: { requesterId: true } } },
    });
    if (!c) return false;
    if (agent) return true;
    // Requesters never see attachments on internal notes.
    if (c.isInternal) return false;
    return !!actor && c.ticket.requesterId === actor.id;
  }

  if (att.articleId != null) {
    if (agent) return true;
    const a = await db.article.findUnique({ where: { id: att.articleId }, select: { status: true, visibility: true } });
    return !!a && a.status === "PUBLISHED" && a.visibility === "PUBLIC";
  }

  return false;
}
