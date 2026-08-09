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
  sendMail, tplTicketReceived, tplTicketAssigned, tplTicketReply, tplTicketResolved, tplTicketParticipant,
} from "@/lib/mail";
import { sanitizeCommentHtml, htmlToText, parseMentionIds } from "@/lib/markdown";
import { runAutomations } from "@/lib/automations";
import { autoAssignTicket } from "@/lib/assignment";
import {
  slaCreateData, pauseData, resumeData, firstResponseData,
} from "@/lib/sla";
import { canTransition, TICKET_TRANSITIONS } from "@/lib/transitions";
import {
  TICKET_TYPES,
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

  // Resolve the SLA and stamp response/resolve deadlines at creation time.
  const sla = await slaCreateData({ slaId: data.slaId, serviceId: data.serviceId, priority: data.priority });
  const ticket = await db.ticket.create({
    data: { ...data, ...sla, status: "NEW" },
    include: { requester: true, assignee: true },
  });

  await writeAudit({ userId: me.id, action: "CREATE", entity: "Ticket", entityId: ticket.id, summary: `Created ticket "${ticket.title}"` });

  // VIP requesters get elevated handling — reprice the SLA against the new priority.
  // If no HIGH SLA resolves, vipSla is {} and the original deadlines are kept.
  if (ticket.requester?.isVip && (ticket.priority === "LOW" || ticket.priority === "MEDIUM")) {
    ticket.priority = "HIGH";
    const vipSla = await slaCreateData({ serviceId: ticket.serviceId, priority: "HIGH" });
    await db.ticket.update({ where: { id: ticket.id }, data: { priority: "HIGH", ...vipSla } });
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

  await runAutomations("TICKET_CREATED", ticket.id);
  // Auto-assign from the group (after automations may have routed it to a team).
  await autoAssignTicket(ticket.id);

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
    const current = await db.ticket.findUnique({ where: { id } });
    if (!current) return;
    // Enforce the allowed lifecycle — reject illegal jumps silently.
    if (!canTransition(TICKET_TRANSITIONS, current.status, value)) return;

    const now = new Date();
    const wasPending = current.status === "PENDING" || current.status === "ON_HOLD";
    const willPending = value === "PENDING" || value === "ON_HOLD";

    // Pause the SLA clock on entering hold; resume (shift deadlines) on leaving.
    if (willPending && !wasPending) Object.assign(patch, pauseData(current, now));
    let effResolveDueAt = current.resolveDueAt;
    if (!willPending && wasPending) {
      const resumed = resumeData(current, now);
      Object.assign(patch, resumed);
      effResolveDueAt = resumed.resolveDueAt ?? current.resolveDueAt;
    }

    if (value === "RESOLVED") {
      patch.resolvedAt = now;
      patch.resolveBreached = effResolveDueAt ? now > effResolveDueAt : false;
    }
    if (value === "CLOSED") patch.closedAt = now;
    if (value === "OPEN" || value === "NEW") {
      patch.resolvedAt = null; patch.closedAt = null;
      patch.resolutionCode = null; patch.resolutionNote = null;
      patch.resolveBreached = false;
    }
    // leaving a pending state clears the reason
    if (!willPending) { patch.pendingReason = null; patch.pendingNote = null; }
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

  await runAutomations("TICKET_UPDATED", id);
  // After automations may have (re)routed the ticket to a team, auto-assign it
  // (no-op if it already has an assignee or the team has no strategy).
  if (field === "groupId" && v) await autoAssignTicket(id);

  revalidatePath(`/tickets/${id}`);
  revalidatePath("/tickets");
}

export async function addTicketComment(formData: FormData) {
  const me = await requireAgent();
  if (!me) return;
  const id = Number(formData.get("ticketId"));
  const isInternal = formData.get("isInternal") === "on";

  // Rich text: sanitize the HTML (server is the real boundary) and derive the
  // plaintext twin for search / notifications / mentions. Legacy plaintext path
  // still works when only `body` is posted.
  const rawHtml = formData.get("bodyHtml");
  let body: string;
  let bodyHtml: string | null;
  if (typeof rawHtml === "string" && rawHtml.trim()) {
    bodyHtml = sanitizeCommentHtml(rawHtml);
    body = htmlToText(bodyHtml).trim();
  } else {
    bodyHtml = null;
    body = String(formData.get("body") ?? "").trim();
  }
  if (!id || !body) return;

  // Re-parent files staged on the ticket while composing onto this comment.
  // Guarded to the author's own not-yet-attached drafts on THIS ticket (nothing
  // else can be hijacked), capped, and atomic with the create so a concurrent
  // double-submit can't misparent a file.
  const attachmentIds = formData.getAll("attachmentIds").map(String).filter(Boolean).slice(0, 20);
  const comment = await db.$transaction(async (tx) => {
    const c = await tx.ticketComment.create({ data: { ticketId: id, authorId: me.id, body, bodyHtml, isInternal } });
    if (attachmentIds.length) {
      await tx.attachment.updateMany({
        where: { id: { in: attachmentIds }, ticketId: id, commentId: null, uploadedById: me.id },
        data: { commentId: c.id, ticketId: null },
      });
    }
    return c;
  });

  // Stamp first response on the first PUBLIC agent reply (drives the response SLA).
  // Conditional updateMany(firstResponseAt: null) so only the first writer wins
  // even if two agents reply concurrently.
  const isPublicAgentReply = !isInternal && me.role !== "USER";
  const before = await db.ticket.findUnique({ where: { id }, select: { firstResponseAt: true, responseDueAt: true } });
  if (isPublicAgentReply && before && !before.firstResponseAt) {
    await db.ticket.updateMany({ where: { id, firstResponseAt: null }, data: firstResponseData(before) });
  }

  const ticket = await db.ticket.update({
    where: { id },
    data: { updatedAt: new Date() },
    include: { requester: true },
  });
  await writeAudit({ userId: me.id, action: "UPDATE", entity: "Ticket", entityId: id, summary: "Added a comment" });

  const snippet = body.length > 160 ? `${body.slice(0, 157)}…` : body;

  // @mentions → notify. Id-first from chips (data-mention-id, exact + spoof-proof:
  // a forged id matches no user), falling back to plaintext @name for legacy rows.
  const mentionIds = bodyHtml ? parseMentionIds(bodyHtml) : [];
  const mentioned = mentionIds.length
    ? await db.user.findMany({ where: { id: { in: mentionIds } }, select: { id: true, name: true } })
    : await resolveMentions(body);
  for (const u of mentioned) {
    if (u.id === me.id) continue;
    await notify(u.id, { type: "MENTION", title: `${me.name} mentioned you`, body: snippet, entity: "Ticket", entityId: String(id) });
  }

  // Notify watchers of the new activity
  await notifyWatchers(id, me.id, { type: "COMMENT", title: `New comment on ${ticketRef(ticket.id, ticket.type)}`, body: snippet, entity: "Ticket", entityId: String(id) });

  // Notify the requester when an agent posts a public reply — with this comment's
  // attachments so the emailed reply actually carries the files.
  if (!isInternal && me.role !== "USER" && ticket.requester?.email && ticket.requesterId !== me.id) {
    const atts = attachmentIds.length
      ? await db.attachment.findMany({ where: { commentId: comment.id }, select: { filename: true, storageKey: true } })
      : [];
    await sendMail({
      to: ticket.requester.email,
      toName: ticket.requester.name,
      entity: "Ticket",
      entityId: ticket.id,
      ...tplTicketReply(ticket, snippet),
      attachments: atts.flatMap((a) => (a.storageKey ? [{ filename: a.filename, storageKey: a.storageKey }] : [])),
    });
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

  const source = await db.ticket.findUnique({
    where: { id },
    include: { comments: { orderBy: { createdAt: "asc" } }, watchers: true },
  });
  if (!source) return;

  // 1) Carry the source's description + comments into the target (attributed to original authors)
  await db.ticketComment.create({
    data: {
      ticketId: targetId, authorId: me.id, isInternal: true,
      body: `⤵︎ Merged from ${ticketRef(source.id, source.type)} — "${source.title}"\n\n${source.description || "(no description)"}`,
    },
  });
  for (const c of source.comments) {
    await db.ticketComment.create({
      data: {
        ticketId: targetId, authorId: c.authorId, isInternal: c.isInternal,
        body: `[from ${ticketRef(source.id, source.type)}] ${c.body}`,
        createdAt: c.createdAt,
      },
    });
  }

  // 2) Move watchers + any linked assets over to the target
  for (const w of source.watchers) {
    await db.ticketWatcher.upsert({
      where: { ticketId_userId: { ticketId: targetId, userId: w.userId } },
      create: { ticketId: targetId, userId: w.userId },
      update: {},
    });
  }
  const srcAssets = await db.ticketAsset.findMany({ where: { ticketId: id } });
  for (const a of srcAssets) {
    await db.ticketAsset.upsert({
      where: { ticketId_assetId: { ticketId: targetId, assetId: a.assetId } },
      create: { ticketId: targetId, assetId: a.assetId },
      update: {},
    });
  }

  // 3) Close the source as merged, and cross-link
  await db.ticket.update({ where: { id }, data: { mergedIntoId: targetId, status: "CANCELLED", closedAt: new Date() } });
  await db.ticketComment.create({ data: { ticketId: id, authorId: me.id, isInternal: true, body: `Merged into ${ticketRef(targetId)}. Comments, watchers and assets were carried over.` } });
  await db.ticketLink.upsert({
    where: { ticketId_linkedTicketId: { ticketId: targetId, linkedTicketId: id } },
    create: { ticketId: targetId, linkedTicketId: id, type: "DUPLICATE" },
    update: { type: "DUPLICATE" },
  });
  await writeAudit({ userId: me.id, action: "UPDATE", entity: "Ticket", entityId: id, summary: `Merged into ${ticketRef(targetId)}` });

  revalidatePath(`/tickets/${id}`);
  revalidatePath(`/tickets/${targetId}`);
  redirect(`/tickets/${targetId}`);
}

// ── Resolution / cancel ──────────────────────────────────────────────────────

export async function setTicketResolution(formData: FormData) {
  const me = await requireAgent();
  if (!me) return;
  const id = Number(formData.get("id"));
  const status = String(formData.get("status") ?? "");
  const code = String(formData.get("code") ?? "").trim() || null;
  const note = String(formData.get("note") ?? "").trim() || null;
  if (!id || !["RESOLVED", "CLOSED", "CANCELLED"].includes(status)) return;

  const current = await db.ticket.findUnique({ where: { id } });
  if (!current) return;
  if (!canTransition(TICKET_TRANSITIONS, current.status, status)) return;

  const now = new Date();
  const clock: Record<string, unknown> = {};
  if (status === "RESOLVED") {
    // Stop the clock: resume/shift out of any pause, then judge breach vs the shifted deadline.
    let effResolveDueAt = current.resolveDueAt;
    if (current.pendingSince) {
      const resumed = resumeData(current, now);
      Object.assign(clock, resumed);
      effResolveDueAt = resumed.resolveDueAt ?? current.resolveDueAt;
    }
    clock.resolveBreached = effResolveDueAt ? now > effResolveDueAt : false;
  } else if (current.pendingSince) {
    // CLOSED/CANCELLED from a paused state: just clear the anchor + bank paused time,
    // no point shifting deadlines on a terminal, non-resolved ticket.
    clock.pendingSince = null;
    clock.pausedMs = current.pausedMs + Math.max(0, now.getTime() - current.pendingSince.getTime());
  }

  const ticket = await db.ticket.update({
    where: { id },
    data: {
      status,
      resolutionCode: status === "CANCELLED" ? null : code,
      resolutionNote: note,
      resolvedAt: status === "RESOLVED" ? now : undefined,
      closedAt: status === "CLOSED" || status === "CANCELLED" ? now : undefined,
      ...clock,
    },
    include: { requester: true },
  });

  const verb = status === "CANCELLED" ? "Cancelled" : status === "CLOSED" ? "Closed" : "Resolved";
  await db.ticketComment.create({
    data: { ticketId: id, authorId: me.id, isInternal: false, body: `${verb}${code ? ` (${code.replace(/_/g, " ").toLowerCase()})` : ""}${note ? `: ${note}` : "."}` },
  });
  await writeAudit({ userId: me.id, action: "UPDATE", entity: "Ticket", entityId: id, summary: `${verb} ticket` });

  if (status === "RESOLVED" && ticket.requester?.email) {
    await sendMail({ to: ticket.requester.email, toName: ticket.requester.name, entity: "Ticket", entityId: id, ...tplTicketResolved(ticket) });
  }
  await runAutomations("TICKET_UPDATED", id);
  revalidatePath(`/tickets/${id}`);
  revalidatePath("/tickets");
}

// ── Unlink relations ─────────────────────────────────────────────────────────

export async function unlinkAsset(formData: FormData) {
  const me = await requireAgent();
  if (!me) return;
  const ticketId = Number(formData.get("ticketId"));
  const assetId = String(formData.get("assetId") ?? "");
  if (!ticketId || !assetId) return;
  await db.ticketAsset.delete({ where: { ticketId_assetId: { ticketId, assetId } } }).catch(() => {});
  revalidatePath(`/tickets/${ticketId}`);
}

export async function unlinkRelation(formData: FormData) {
  const me = await requireAgent();
  if (!me) return;
  const ticketId = Number(formData.get("ticketId"));
  const kind = String(formData.get("kind") ?? "");
  if (!ticketId || !["problem", "change"].includes(kind)) return;
  await db.ticket.update({ where: { id: ticketId }, data: kind === "problem" ? { problemId: null } : { changeId: null } });
  revalidatePath(`/tickets/${ticketId}`);
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

// ── Time tracking ────────────────────────────────────────────────────────────

export type WorkLogState = { ok?: boolean; error?: string } | undefined;

export async function addWorkLog(formData: FormData): Promise<WorkLogState> {
  const me = await requireAgent();
  if (!me) return { error: "Not authorised" };
  const ticketId = Number(formData.get("ticketId"));
  const minutes = Math.floor(Number(formData.get("minutes")));
  const note = String(formData.get("note") ?? "").trim() || null;
  const billable = formData.get("billable") === "on";
  // Cap at one year of minutes to stay within a 32-bit Int and reject nonsense.
  if (!ticketId || !Number.isFinite(minutes) || minutes <= 0 || minutes > 60 * 24 * 366) {
    return { error: "Enter a valid number of minutes." };
  }

  // Ensure the ticket exists so a bogus id can't trigger an FK-constraint 500.
  const ticket = await db.ticket.findUnique({ where: { id: ticketId }, select: { id: true } });
  if (!ticket) return { error: "Ticket not found." };

  await db.workLog.create({ data: { ticketId, userId: me.id, minutes, note, billable } });
  await writeAudit({ userId: me.id, action: "UPDATE", entity: "Ticket", entityId: ticketId, summary: `Logged ${minutes} min` });
  revalidatePath(`/tickets/${ticketId}`);
  return { ok: true };
}

export async function deleteWorkLog(formData: FormData) {
  const me = await requireAgent();
  if (!me) return;
  const logId = String(formData.get("logId") ?? "");
  const log = await db.workLog.findUnique({ where: { id: logId } });
  if (!log) return;
  // Own entries only (admins may remove any).
  if (log.userId !== me.id && me.role !== "ADMIN") return;
  await db.workLog.delete({ where: { id: logId } }).catch(() => {});
  revalidatePath(`/tickets/${log.ticketId}`);
}

export async function updateTicketDetails(formData: FormData) {
  const me = await requireAgent();
  if (!me) return;
  const id = Number(formData.get("id"));
  const title = String(formData.get("title") ?? "").trim();
  if (!id || title.length < 3) return;

  // Rich description twin when HTML is supplied (e.g. inbound email); otherwise plaintext.
  const rawHtml = formData.get("descriptionHtml");
  const data: Record<string, unknown> = { title };
  if (typeof rawHtml === "string" && rawHtml.trim()) {
    const descriptionHtml = sanitizeCommentHtml(rawHtml);
    data.descriptionHtml = descriptionHtml;
    data.description = htmlToText(descriptionHtml);
  } else {
    data.description = String(formData.get("description") ?? "");
    data.descriptionHtml = null;
  }
  await db.ticket.update({ where: { id }, data });
  await writeAudit({ userId: me.id, action: "UPDATE", entity: "Ticket", entityId: id, summary: "Edited details" });
  revalidatePath(`/tickets/${id}`);
  revalidatePath("/tickets");
}

export async function setTicketDueDate(formData: FormData) {
  const me = await requireAgent();
  if (!me) return;
  const id = Number(formData.get("id"));
  if (!id) return;
  const raw = String(formData.get("dueDate") ?? "").trim();
  const dueDate = raw ? new Date(raw) : null;
  if (dueDate && Number.isNaN(dueDate.getTime())) return;
  const exists = await db.ticket.findUnique({ where: { id }, select: { id: true } });
  if (!exists) return;
  await db.ticket.update({ where: { id }, data: { dueDate } });
  await writeAudit({ userId: me.id, action: "UPDATE", entity: "Ticket", entityId: id, summary: dueDate ? "Set due date" : "Cleared due date" });
  revalidatePath(`/tickets/${id}`);
  revalidatePath("/tickets");
}

// ── Collaboration: participants & external forward ───────────────────────────

const participantSchema = z.object({
  ticketId: z.coerce.number(),
  userId: z.string().min(1),
});

/** Add someone as a participant (watcher) and notify them — WITHOUT an @mention. */
export async function addParticipant(formData: FormData) {
  const me = await requireAgent();
  if (!me) return;
  const parsed = participantSchema.safeParse({ ticketId: formData.get("ticketId"), userId: formData.get("userId") });
  if (!parsed.success) return;
  const { ticketId, userId } = parsed.data;
  const notifyByEmail = formData.get("notifyByEmail") === "on";
  const note = String(formData.get("note") ?? "").trim();
  if (userId === me.id) return;

  const ticket = await db.ticket.findUnique({ where: { id: ticketId }, include: { requester: true } });
  if (!ticket) return;
  const target = await db.user.findUnique({ where: { id: userId }, select: { id: true, name: true, email: true, isActive: true } });
  if (!target || !target.isActive) return;

  await db.ticketWatcher.upsert({
    where: { ticketId_userId: { ticketId, userId } },
    create: { ticketId, userId },
    update: {},
  });

  await notify(userId, {
    type: "PARTICIPANT_ADDED",
    title: `${me.name} added you to ${ticketRef(ticket.id, ticket.type)}`,
    body: note || ticket.title,
    entity: "Ticket",
    entityId: String(ticketId),
  });
  if (notifyByEmail && target.email) {
    await sendMail({ to: target.email, toName: target.name, entity: "Ticket", entityId: ticketId, ...tplTicketParticipant(ticket, target.name ?? "there", me.name, note) });
  }
  await db.ticketComment.create({
    data: { ticketId, authorId: me.id, isInternal: true, body: `Added ${target.name ?? target.email} as a participant${note ? `: ${note}` : "."}` },
  });
  await writeAudit({ userId: me.id, action: "UPDATE", entity: "Ticket", entityId: ticketId, summary: `Added participant ${target.name ?? target.email}` });
  revalidatePath(`/tickets/${ticketId}`);
}

export type ForwardState = { ok?: boolean; error?: string } | undefined;

const forwardSchema = z.object({
  ticketId: z.coerce.number(),
  email: z.string().email(),
});

/**
 * Forward the ticket to an EXTERNAL email as an INTERNAL action. Privacy invariant:
 * the requester is never emailed or notified — only an internal trail comment is
 * written (isInternal:true → invisible in the portal), and included context is
 * public-only.
 */
export async function forwardTicketExternal(_prev: ForwardState, formData: FormData): Promise<ForwardState> {
  const me = await requireAgent();
  if (!me) return { error: "Not authorised" };
  const parsed = forwardSchema.safeParse({ ticketId: formData.get("ticketId"), email: formData.get("email") });
  if (!parsed.success) return { error: "Please enter a valid email address." };
  const { ticketId, email } = parsed.data;
  const toName = String(formData.get("toName") ?? "").trim();
  const note = String(formData.get("note") ?? "").trim();
  const includeComments = formData.get("includeComments") === "on";

  const ticket = await db.ticket.findUnique({
    where: { id: ticketId },
    include: {
      requester: true,
      comments: { where: { isInternal: false }, include: { author: true }, orderBy: { createdAt: "asc" } },
    },
  });
  if (!ticket) return { error: "Ticket not found." };

  // Never forward to the requester via this internal path.
  if (email.toLowerCase() === ticket.requester.email.toLowerCase()) {
    return { error: "Use a public reply to contact the requester." };
  }

  let bodyText = `Ticket ${ticketRef(ticket.id, ticket.type)} — "${ticket.title}"
Status: ${ticket.status} · Priority: ${ticket.priority}

${ticket.description || "(no description)"}`;
  if (note) bodyText = `${note}

---
${bodyText}`;
  if (includeComments && ticket.comments.length > 0) {
    const thread = ticket.comments.map((c) => `${c.author.name ?? c.author.email}: ${c.body}`).join("\n\n");
    bodyText += `

--- Correspondence ---
${thread}`;
  }

  await sendMail({
    to: email,
    toName: toName || null,
    entity: "Ticket",
    entityId: ticketId,
    template: "ticket_forward",
    subject: `[${ticketRef(ticket.id, ticket.type)}] Forwarded: ${ticket.title}`,
    body: bodyText,
  });
  await db.ticketComment.create({
    data: { ticketId, authorId: me.id, isInternal: true, body: `Forwarded to ${email}${toName ? ` (${toName})` : ""}${note ? `: ${note}` : "."}` },
  });
  await writeAudit({ userId: me.id, action: "UPDATE", entity: "Ticket", entityId: ticketId, summary: `Forwarded to ${email}` });
  revalidatePath(`/tickets/${ticketId}`);
  return { ok: true };
}

export async function setTicketPending(formData: FormData) {
  const me = await requireAgent();
  if (!me) return;
  const id = Number(formData.get("id"));
  const status = String(formData.get("status") ?? "");
  const reason = String(formData.get("reason") ?? "");
  const note = String(formData.get("note") ?? "").trim() || null;
  if (!id || !["PENDING", "ON_HOLD"].includes(status) || !reason) return;

  const current = await db.ticket.findUnique({ where: { id }, select: { status: true, pendingSince: true } });
  if (!current) return;
  if (!canTransition(TICKET_TRANSITIONS, current.status, status)) return;

  await db.ticket.update({
    where: { id },
    data: { status, pendingReason: reason, pendingNote: note, ...pauseData(current) },
  });
  const reasonLabel = reason.replace(/_/g, " ").toLowerCase();
  await db.ticketComment.create({
    data: { ticketId: id, authorId: me.id, isInternal: true, body: `Set to ${status === "ON_HOLD" ? "on hold" : "pending"} — ${reasonLabel}${note ? `: ${note}` : ""}.` },
  });
  await writeAudit({ userId: me.id, action: "UPDATE", entity: "Ticket", entityId: id, summary: `Set ${status.toLowerCase()} (${reasonLabel})` });
  await runAutomations("TICKET_UPDATED", id);
  revalidatePath(`/tickets/${id}`);
  revalidatePath("/tickets");
}
