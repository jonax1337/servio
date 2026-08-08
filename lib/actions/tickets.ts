"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { db } from "@/lib/db";
import { getSessionUser, isAgent, type Role } from "@/lib/session";
import { writeAudit, notify } from "@/lib/audit";

/** Only agents/managers/admins may act on the agent console. */
async function requireAgent() {
  const me = await getSessionUser();
  if (!me || !isAgent(me.role as Role)) return null;
  return me;
}
import {
  sendMail, tplTicketReceived, tplTicketAssigned, tplTicketReply, tplTicketResolved,
} from "@/lib/mail";
import {
  TICKET_TYPES,
  TICKET_STATUSES,
  PRIORITIES,
  IMPACT_URGENCY,
  TICKET_SOURCES,
  ticketRef,
} from "@/lib/constants";

const optionalId = z
  .string()
  .optional()
  .transform((v) => (v && v !== "none" && v !== "" ? v : null));

const createSchema = z.object({
  title: z.string().min(3, "Title must be at least 3 characters"),
  description: z.string().default(""),
  type: z.enum(TICKET_TYPES),
  priority: z.enum(PRIORITIES),
  impact: z.enum(IMPACT_URGENCY),
  urgency: z.enum(IMPACT_URGENCY),
  source: z.enum(TICKET_SOURCES).default("AGENT"),
  requesterId: z.string().min(1, "Requester is required"),
  assigneeId: optionalId,
  groupId: optionalId,
  queueId: optionalId,
  categoryId: optionalId,
  serviceId: optionalId,
  slaId: optionalId,
});

export type ActionState = { error?: string; fieldErrors?: Record<string, string[]> } | undefined;

export async function createTicket(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const me = await requireAgent();
  if (!me) return { error: "Not authorised" };

  const parsed = createSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) {
    return { error: "Please fix the errors below.", fieldErrors: parsed.error.flatten().fieldErrors };
  }
  const data = parsed.data;

  const ticket = await db.ticket.create({
    data: { ...data, status: "NEW" },
    include: { requester: true, assignee: true },
  });

  await writeAudit({ userId: me.id, action: "CREATE", entity: "Ticket", entityId: ticket.id, summary: `Created ticket "${ticket.title}"` });

  // VIP requesters get elevated handling
  if (ticket.requester?.isVip && (ticket.priority === "LOW" || ticket.priority === "MEDIUM")) {
    ticket.priority = "HIGH";
    await db.ticket.update({ where: { id: ticket.id }, data: { priority: "HIGH" } });
  }

  // Confirmation to the requester
  if (ticket.requester?.email) {
    await sendMail({ to: ticket.requester.email, toName: ticket.requester.name, entity: "Ticket", entityId: ticket.id, ...tplTicketReceived(ticket) });
  }
  // Assignment notice
  if (ticket.assignee && ticket.assigneeId !== me.id) {
    await notify(ticket.assigneeId!, { type: "ASSIGNED", title: "Ticket assigned to you", body: ticket.title, entity: "Ticket", entityId: String(ticket.id) });
    if (ticket.assignee.email) {
      await sendMail({ to: ticket.assignee.email, toName: ticket.assignee.name, entity: "Ticket", entityId: ticket.id, ...tplTicketAssigned(ticket, ticket.assignee.name ?? "there") });
    }
  }

  revalidatePath("/tickets");
  redirect(`/tickets/${ticket.id}`);
}

const updateSchema = z.object({
  id: z.coerce.number(),
  field: z.enum([
    "status", "priority", "impact", "urgency", "type",
    "assigneeId", "groupId", "queueId", "categoryId", "serviceId", "slaId",
  ]),
  value: z.string(),
});

export async function updateTicketField(formData: FormData) {
  const me = await requireAgent();
  if (!me) return;
  const parsed = updateSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return;
  const { id, field, value } = parsed.data;

  const isRelation = field.endsWith("Id");
  const v = isRelation && (value === "none" || value === "") ? null : value;

  const patch: Record<string, unknown> = { [field]: v };
  if (field === "status") {
    if (value === "RESOLVED") patch.resolvedAt = new Date();
    if (value === "CLOSED") patch.closedAt = new Date();
    if (value === "OPEN" || value === "NEW") { patch.resolvedAt = null; patch.closedAt = null; }
  }

  const ticket = await db.ticket.update({
    where: { id },
    data: patch,
    include: { requester: true, assignee: true },
  });
  await writeAudit({ userId: me.id, action: "UPDATE", entity: "Ticket", entityId: id, summary: `Updated ${field}` });

  if (field === "status" && value === "RESOLVED" && ticket.requester?.email) {
    await sendMail({ to: ticket.requester.email, toName: ticket.requester.name, entity: "Ticket", entityId: ticket.id, ...tplTicketResolved(ticket) });
  }
  if (field === "assigneeId" && ticket.assignee?.email && ticket.assigneeId !== me.id) {
    await notify(ticket.assigneeId!, { type: "ASSIGNED", title: "Ticket assigned to you", body: ticket.title, entity: "Ticket", entityId: String(ticket.id) });
    await sendMail({ to: ticket.assignee.email, toName: ticket.assignee.name, entity: "Ticket", entityId: ticket.id, ...tplTicketAssigned(ticket, ticket.assignee.name ?? "there") });
  }

  revalidatePath(`/tickets/${id}`);
  revalidatePath("/tickets");
}

export async function addTicketComment(formData: FormData) {
  const me = await requireAgent();
  if (!me) return;
  const id = Number(formData.get("ticketId"));
  const body = String(formData.get("body") ?? "").trim();
  const isInternal = formData.get("isInternal") === "on";
  if (!id || !body) return;

  await db.ticketComment.create({ data: { ticketId: id, authorId: me.id, body, isInternal } });
  const ticket = await db.ticket.update({
    where: { id },
    data: { updatedAt: new Date() },
    include: { requester: true },
  });
  await writeAudit({ userId: me.id, action: "UPDATE", entity: "Ticket", entityId: id, summary: "Added a comment" });

  const snippet = body.length > 160 ? `${body.slice(0, 157)}…` : body;

  // @mentions → notify mentioned users
  const mentioned = await resolveMentions(body);
  for (const u of mentioned) {
    if (u.id === me.id) continue;
    await notify(u.id, { type: "MENTION", title: `${me.name} mentioned you`, body: snippet, entity: "Ticket", entityId: String(id) });
  }

  // Notify watchers of the new activity
  await notifyWatchers(id, me.id, { type: "COMMENT", title: `New comment on ${ticketRef(ticket.id, ticket.type)}`, body: snippet, entity: "Ticket", entityId: String(id) });

  // Notify the requester when an agent posts a public reply
  if (!isInternal && me.role !== "USER" && ticket.requester?.email && ticket.requesterId !== me.id) {
    await sendMail({ to: ticket.requester.email, toName: ticket.requester.name, entity: "Ticket", entityId: ticket.id, ...tplTicketReply(ticket, snippet) });
  }

  revalidatePath(`/tickets/${id}`);
}

// ── Collaboration helpers ──────────────────────────────────────────────────

const PRIORITY_ORDER = ["LOW", "MEDIUM", "HIGH", "CRITICAL"] as const;

async function notifyWatchers(
  ticketId: number,
  exclude: string | null,
  n: { type?: string; title: string; body?: string; entity?: string; entityId?: string },
) {
  const watchers = await db.ticketWatcher.findMany({ where: { ticketId }, select: { userId: true } });
  await Promise.all(
    watchers.filter((w) => w.userId !== exclude).map((w) => notify(w.userId, n)),
  );
}

/** Find users referenced with @Name / @email in a comment body. */
async function resolveMentions(body: string) {
  const tokens = body.match(/@([\w.@-]{2,})/g)?.map((t) => t.slice(1).toLowerCase()) ?? [];
  if (tokens.length === 0) return [];
  const users = await db.user.findMany({ select: { id: true, name: true, email: true } });
  return users.filter((u) => {
    const first = (u.name ?? "").split(" ")[0].toLowerCase();
    const handle = (u.name ?? "").toLowerCase().replace(/\s+/g, "");
    const email = u.email.toLowerCase();
    const emailLocal = email.split("@")[0];
    return tokens.some((tk) => tk === first || tk === handle || tk === email || tk === emailLocal);
  });
}

// ── Ticket actions ─────────────────────────────────────────────────────────

export async function escalateTicket(formData: FormData) {
  const me = await requireAgent();
  if (!me) return;
  const id = Number(formData.get("id"));
  if (!id) return;
  const t = await db.ticket.findUnique({ where: { id } });
  if (!t) return;
  const next = PRIORITY_ORDER[Math.min(PRIORITY_ORDER.indexOf(t.priority as (typeof PRIORITY_ORDER)[number]) + 1, 3)];
  await db.ticket.update({ where: { id }, data: { priority: next, status: t.status === "NEW" ? "OPEN" : t.status } });
  await writeAudit({ userId: me.id, action: "UPDATE", entity: "Ticket", entityId: id, summary: `Escalated priority to ${next}` });
  if (t.assigneeId) await notify(t.assigneeId, { type: "ESCALATION", title: `Ticket escalated to ${next}`, body: t.title, entity: "Ticket", entityId: String(id) });
  await notifyWatchers(id, me.id, { type: "ESCALATION", title: `Ticket escalated to ${next}`, body: t.title, entity: "Ticket", entityId: String(id) });
  revalidatePath(`/tickets/${id}`);
  revalidatePath("/tickets");
}

export async function toggleMajorIncident(formData: FormData) {
  const me = await requireAgent();
  if (!me) return;
  const id = Number(formData.get("id"));
  if (!id) return;
  const t = await db.ticket.findUnique({ where: { id }, include: { assignee: true } });
  if (!t) return;
  const now = !t.isMajorIncident;
  await db.ticket.update({
    where: { id },
    data: now ? { isMajorIncident: true, priority: "CRITICAL", status: t.status === "NEW" ? "OPEN" : t.status } : { isMajorIncident: false },
  });
  await writeAudit({ userId: me.id, action: "UPDATE", entity: "Ticket", entityId: id, summary: now ? "Declared a Major Incident" : "Cleared Major Incident" });
  if (now) {
    if (t.assigneeId) await notify(t.assigneeId, { type: "MAJOR_INCIDENT", title: "Major Incident declared", body: t.title, entity: "Ticket", entityId: String(id) });
    await notifyWatchers(id, me.id, { type: "MAJOR_INCIDENT", title: "Major Incident declared", body: t.title, entity: "Ticket", entityId: String(id) });
  }
  revalidatePath(`/tickets/${id}`);
  revalidatePath("/tickets");
}

export async function toggleWatch(formData: FormData) {
  const me = await requireAgent();
  if (!me) return;
  const id = Number(formData.get("id"));
  if (!id) return;
  const existing = await db.ticketWatcher.findUnique({ where: { ticketId_userId: { ticketId: id, userId: me.id } } });
  if (existing) await db.ticketWatcher.delete({ where: { ticketId_userId: { ticketId: id, userId: me.id } } });
  else await db.ticketWatcher.create({ data: { ticketId: id, userId: me.id } });
  revalidatePath(`/tickets/${id}`);
}

export async function linkTicket(formData: FormData) {
  const me = await requireAgent();
  if (!me) return;
  const id = Number(formData.get("id"));
  const targetId = Number(formData.get("targetId"));
  const type = String(formData.get("type") || "RELATED");
  if (!id || !targetId || id === targetId) return;
  await db.ticketLink.upsert({
    where: { ticketId_linkedTicketId: { ticketId: id, linkedTicketId: targetId } },
    create: { ticketId: id, linkedTicketId: targetId, type },
    update: { type },
  });
  await writeAudit({ userId: me.id, action: "UPDATE", entity: "Ticket", entityId: id, summary: `Linked to ${ticketRef(targetId)}` });
  revalidatePath(`/tickets/${id}`);
}

export async function unlinkTicket(formData: FormData) {
  const me = await requireAgent();
  if (!me) return;
  const linkId = String(formData.get("linkId"));
  const ticketId = Number(formData.get("ticketId"));
  if (!linkId) return;
  await db.ticketLink.delete({ where: { id: linkId } }).catch(() => {});
  revalidatePath(`/tickets/${ticketId}`);
}

export async function mergeTicket(formData: FormData) {
  const me = await requireAgent();
  if (!me) return;
  const id = Number(formData.get("id"));
  const targetId = Number(formData.get("targetId"));
  if (!id || !targetId || id === targetId) return;
  await db.ticket.update({ where: { id }, data: { mergedIntoId: targetId, status: "CANCELLED", closedAt: new Date() } });
  await db.ticketComment.create({ data: { ticketId: id, authorId: me.id, isInternal: true, body: `Merged into ${ticketRef(targetId)}.` } });
  await db.ticketComment.create({ data: { ticketId: targetId, authorId: me.id, isInternal: true, body: `${ticketRef(id)} was merged into this ticket.` } });
  await writeAudit({ userId: me.id, action: "UPDATE", entity: "Ticket", entityId: id, summary: `Merged into ${ticketRef(targetId)}` });
  revalidatePath(`/tickets/${id}`);
  revalidatePath(`/tickets/${targetId}`);
  redirect(`/tickets/${targetId}`);
}

// ── Tasks ──────────────────────────────────────────────────────────────────

export async function addTask(formData: FormData) {
  const me = await requireAgent();
  if (!me) return;
  const ticketId = Number(formData.get("ticketId"));
  const title = String(formData.get("title") ?? "").trim();
  if (!ticketId || !title) return;
  const count = await db.task.count({ where: { ticketId } });
  await db.task.create({ data: { ticketId, title, order: count } });
  revalidatePath(`/tickets/${ticketId}`);
}

export async function toggleTask(formData: FormData) {
  const me = await requireAgent();
  if (!me) return;
  const taskId = String(formData.get("taskId"));
  const task = await db.task.findUnique({ where: { id: taskId } });
  if (!task) return;
  await db.task.update({ where: { id: taskId }, data: { done: !task.done } });
  revalidatePath(`/tickets/${task.ticketId}`);
}

export async function deleteTask(formData: FormData) {
  const me = await requireAgent();
  if (!me) return;
  const taskId = String(formData.get("taskId"));
  const task = await db.task.findUnique({ where: { id: taskId } });
  if (!task) return;
  await db.task.delete({ where: { id: taskId } });
  revalidatePath(`/tickets/${task.ticketId}`);
}
