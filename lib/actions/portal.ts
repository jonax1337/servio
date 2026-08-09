"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { db } from "@/lib/db";
import { getSessionUser } from "@/lib/session";
import { writeAudit } from "@/lib/audit";
import { sendMail, tplTicketReceived } from "@/lib/mail";
import { runAutomations } from "@/lib/automations";
import { slaCreateData } from "@/lib/sla";
import { sanitizeCommentHtml, htmlToText } from "@/lib/markdown";
import { TICKET_TYPES, PRIORITIES } from "@/lib/constants";

export type PortalState = { error?: string; fieldErrors?: Record<string, string[]> } | undefined;

const optionalId = z
  .string()
  .optional()
  .transform((v) => (v && v !== "none" && v !== "" ? v : null));

const schema = z.object({
  title: z.string().min(3, "Please enter a short summary (min 3 characters)"),
  description: z.string().default(""),
  type: z.enum(TICKET_TYPES).default("INCIDENT"),
  priority: z.enum(PRIORITIES).default("MEDIUM"),
  categoryId: optionalId,
  serviceId: optionalId,
});

export async function createPortalTicket(_prev: PortalState, formData: FormData): Promise<PortalState> {
  const me = await getSessionUser();
  if (!me) return { error: "Not authenticated" };

  const parsed = schema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) {
    return { error: "Please fix the highlighted fields.", fieldErrors: parsed.error.flatten().fieldErrors };
  }

  const triage = await db.queue.findFirst({ where: { name: "Triage" } });
  const sla = await slaCreateData({ serviceId: parsed.data.serviceId, priority: parsed.data.priority });
  const ticket = await db.ticket.create({
    data: {
      ...parsed.data,
      ...sla,
      status: "NEW",
      source: "PORTAL",
      impact: "MEDIUM",
      urgency: "MEDIUM",
      requesterId: me.id,
      queueId: triage?.id ?? null,
    },
  });
  await writeAudit({ userId: me.id, action: "CREATE", entity: "Ticket", entityId: ticket.id, summary: "Submitted via self-service portal" });
  if (me.email) {
    await sendMail({ to: me.email, toName: me.name, entity: "Ticket", entityId: ticket.id, ...tplTicketReceived(ticket) });
  }

  await runAutomations("TICKET_CREATED", ticket.id);

  revalidatePath("/portal/tickets");
  redirect(`/portal/tickets/${ticket.id}`);
}

export async function addPortalComment(formData: FormData) {
  const me = await getSessionUser();
  if (!me) return;
  const id = Number(formData.get("ticketId"));

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

  // portal users can only comment on their own tickets
  const ticket = await db.ticket.findFirst({ where: { id, requesterId: me.id } });
  if (!ticket) return;

  // Attach files staged on the requester's own ticket onto this comment (atomic + capped).
  const attachmentIds = formData.getAll("attachmentIds").map(String).filter(Boolean).slice(0, 20);
  await db.$transaction(async (tx) => {
    const c = await tx.ticketComment.create({ data: { ticketId: id, authorId: me.id, body, bodyHtml, isInternal: false } });
    if (attachmentIds.length) {
      await tx.attachment.updateMany({
        where: { id: { in: attachmentIds }, ticketId: id, commentId: null, uploadedById: me.id },
        data: { commentId: c.id, ticketId: null },
      });
    }
  });

  await db.ticket.update({ where: { id }, data: { updatedAt: new Date() } });
  revalidatePath(`/portal/tickets/${id}`);
}
