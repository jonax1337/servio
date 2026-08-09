"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { db } from "@/lib/db";
import { getSessionUser } from "@/lib/session";
import { writeAudit, notify } from "@/lib/audit";
import { sendMail, tplTicketReceived } from "@/lib/mail";
import { runAutomations } from "@/lib/automations";
import { autoAssignTicket } from "@/lib/assignment";
import { slaCreateData } from "@/lib/sla";
import { parseFormSchema, validateAnswers, answersToText } from "@/lib/service-forms";
import { ticketRef } from "@/lib/constants";

export type CatalogState =
  | { error?: string; fieldErrors?: Record<string, string> }
  | undefined;

export async function createCatalogRequest(
  _prev: CatalogState,
  formData: FormData,
): Promise<CatalogState> {
  const me = await getSessionUser();
  if (!me) return { error: "Not authenticated" };

  const itemId = String(formData.get("catalogItemId") ?? "");
  const item = await db.catalogItem.findUnique({ where: { id: itemId } });
  if (!item || !item.isPublished) return { error: "This item can't be requested." };
  if (item.requiresApproval && !item.approverId) {
    return { error: "This item requires approval but has no approver configured. Please contact IT." };
  }

  const fields = parseFormSchema(item.formSchema);
  const data: Record<string, string> = {};
  for (const [k, v] of formData.entries()) if (k.startsWith("f_")) data[k] = String(v);
  const { values, errors } = validateAnswers(fields, data);
  if (Object.keys(errors).length > 0) {
    return { error: "Please complete the required fields.", fieldErrors: errors };
  }

  const summary = answersToText(fields, values);
  const triage = await db.group.findFirst({ where: { name: "Service Desk" } });
  const needsApproval = item.requiresApproval && !!item.approverId;

  // Requests run at MEDIUM by default; pause the SLA clock while awaiting approval.
  const sla = await slaCreateData({ priority: "MEDIUM" });
  const ticket = await db.ticket.create({
    data: {
      title: `${item.name} request`,
      // Answers are kept structured in formData and shown as a form on the ticket —
      // not dumped into the body. The description stays a short one-liner.
      description: `Catalog request: ${item.name}.`,
      type: "REQUEST",
      status: needsApproval ? "PENDING" : "NEW",
      source: "PORTAL",
      priority: "MEDIUM",
      requesterId: me.id,
      catalogItemId: item.id,
      categoryId: item.categoryId,
      groupId: triage?.id ?? null,
      formData: JSON.stringify(values),
      formSchema: item.formSchema, // snapshot so answers stay rendable if the item is later deleted

      approvalState: needsApproval ? "PENDING" : null,
      ...sla,
      ...(needsApproval ? { pendingSince: new Date() } : {}),
    },
  });

  await writeAudit({ userId: me.id, action: "CREATE", entity: "Ticket", entityId: ticket.id, summary: `Ordered "${item.name}" from the catalog` });

  if (needsApproval && item.approverId) {
    await db.ticketApproval.create({ data: { ticketId: ticket.id, approverId: item.approverId } });
    await notify(item.approverId, {
      type: "APPROVAL", title: "Approval needed",
      body: `${me.name} requested ${item.name} (${ticketRef(ticket.id, "REQUEST")})`,
      entity: "Ticket", entityId: String(ticket.id),
    });
    const approver = await db.user.findUnique({ where: { id: item.approverId } });
    if (approver?.email) {
      await sendMail({
        to: approver.email, toName: approver.name, entity: "Ticket", entityId: ticket.id, template: "approval_request",
        subject: `[${ticketRef(ticket.id, "REQUEST")}] Approval needed: ${item.name}`,
        body: `Hi ${approver.name ?? "there"},\n\n${me.name} has requested "${item.name}".\n\n${summary}\n\nPlease review and approve or reject it in Servio under Approvals.\n\n— Servio`,
      });
    }
  }

  if (me.email) {
    await sendMail({ to: me.email, toName: me.name, entity: "Ticket", entityId: ticket.id, ...tplTicketReceived(ticket) });
  }
  if (!needsApproval) {
    await runAutomations("TICKET_CREATED", ticket.id);
    await autoAssignTicket(ticket.id);
  }

  revalidatePath("/portal/tickets");
  redirect(`/portal/tickets/${ticket.id}`);
}
