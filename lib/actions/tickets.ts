"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { db } from "@/lib/db";
import { getSessionUser } from "@/lib/session";
import { writeAudit, notify } from "@/lib/audit";
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
  });

  await writeAudit({ userId: me.id, action: "CREATE", entity: "Ticket", entityId: ticket.id, summary: `Created ticket "${ticket.title}"` });
  if (data.assigneeId && data.assigneeId !== me.id) {
    await notify(data.assigneeId, { type: "ASSIGNED", title: "Ticket assigned to you", body: ticket.title, entity: "Ticket", entityId: String(ticket.id) });
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

  await db.ticket.update({ where: { id }, data: patch });
  await writeAudit({ userId: me.id, action: "UPDATE", entity: "Ticket", entityId: id, summary: `Updated ${field}` });
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
  await db.ticket.update({ where: { id }, data: { updatedAt: new Date() } });
  await writeAudit({ userId: me.id, action: "UPDATE", entity: "Ticket", entityId: id, summary: "Added a comment" });
  revalidatePath(`/tickets/${id}`);
}
