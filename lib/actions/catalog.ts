"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { db } from "@/lib/db";
import { getSessionUser } from "@/lib/session";
import { writeAudit, notify } from "@/lib/audit";
import { sendMail, tplTicketReceived } from "@/lib/mail";
import { parseFormSchema, validateAnswers, answersToText } from "@/lib/service-forms";
import { ticketRef } from "@/lib/constants";

export type CatalogState =
  | { error?: string; fieldErrors?: Record<string, string> }
  | undefined;

export async function createServiceRequest(
  _prev: CatalogState,
  formData: FormData,
): Promise<CatalogState> {
  const me = await getSessionUser();
  if (!me) return { error: "Not authenticated" };

  const serviceId = String(formData.get("serviceId") ?? "");
  const service = await db.service.findUnique({ where: { id: serviceId } });
  if (!service) return { error: "Service not found" };

  const fields = parseFormSchema(service.formSchema);
  const data: Record<string, string> = {};
  for (const [k, v] of formData.entries()) if (k.startsWith("f_")) data[k] = String(v);
  const { values, errors } = validateAnswers(fields, data);
  if (Object.keys(errors).length > 0) {
    return { error: "Please complete the required fields.", fieldErrors: errors };
  }

  const summary = answersToText(fields, values);
  const triage = await db.queue.findFirst({ where: { name: "Triage" } });

  const needsApproval = service.requiresApproval && !!service.approverId;
  const ticket = await db.ticket.create({
    data: {
      title: `${service.name} request`,
      description: `Service request: ${service.name}\n\n${summary || "(no additional details)"}`,
      type: "REQUEST",
      status: needsApproval ? "PENDING" : "NEW",
      source: "PORTAL",
      requesterId: me.id,
      serviceId: service.id,
      categoryId: service.categoryId,
      slaId: service.slaId,
      queueId: triage?.id ?? null,
      formData: JSON.stringify(values),
      approvalState: needsApproval ? "PENDING" : null,
    },
  });

  await writeAudit({ userId: me.id, action: "CREATE", entity: "Ticket", entityId: ticket.id, summary: `Ordered "${service.name}" from the catalog` });

  if (needsApproval && service.approverId) {
    await db.ticketApproval.create({ data: { ticketId: ticket.id, approverId: service.approverId } });
    await notify(service.approverId, {
      type: "APPROVAL",
      title: "Approval needed",
      body: `${me.name} requested ${service.name} (${ticketRef(ticket.id, "REQUEST")})`,
      entity: "Ticket",
      entityId: String(ticket.id),
    });
    const approver = await db.user.findUnique({ where: { id: service.approverId } });
    if (approver?.email) {
      await sendMail({
        to: approver.email, toName: approver.name, entity: "Ticket", entityId: ticket.id,
        template: "approval_request",
        subject: `[${ticketRef(ticket.id, "REQUEST")}] Approval needed: ${service.name}`,
        body: `Hi ${approver.name ?? "there"},\n\n${me.name} has requested "${service.name}".\n\n${summary}\n\nPlease review and approve or reject it in Servio under Approvals.\n\n— Servio`,
      });
    }
  }

  if (me.email) {
    await sendMail({ to: me.email, toName: me.name, entity: "Ticket", entityId: ticket.id, ...tplTicketReceived(ticket) });
  }

  revalidatePath("/portal/tickets");
  redirect(`/portal/tickets/${ticket.id}`);
}
