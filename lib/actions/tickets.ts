"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { db } from "@/lib/db";
import { getSessionUser } from "@/lib/session";
import { writeAudit, notify } from "@/lib/audit";
import {
  sendMail, tplTicketReceived, tplTicketAssigned, tplTicketReply, tplTicketResolved,
} from "@/lib/mail";
import {
  TICKET_TYPES,
  TICKET_STATUSES,
  PRIORITIES,
  IMPACT_URGENCY,
  TICKET_SOURCES,
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
  const me = await getSessionUser();
  if (!me) return { error: "Not authenticated" };

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
  const me = await getSessionUser();
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
  const me = await getSessionUser();
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

  // Notify the requester when an agent posts a public reply
  if (!isInternal && me.role !== "USER" && ticket.requester?.email && ticket.requesterId !== me.id) {
    const snippet = body.length > 160 ? `${body.slice(0, 157)}…` : body;
    await sendMail({ to: ticket.requester.email, toName: ticket.requester.name, entity: "Ticket", entityId: ticket.id, ...tplTicketReply(ticket, snippet) });
  }

  revalidatePath(`/tickets/${id}`);
}
