"use server";

import { revalidatePath } from "next/cache";
import { db } from "@/lib/db";
import { getSessionUser } from "@/lib/session";
import { writeAudit, notify } from "@/lib/audit";
import { sendMail } from "@/lib/mail";
import { ticketRef } from "@/lib/constants";

export async function decideApproval(formData: FormData) {
  const me = await getSessionUser();
  if (!me) return;
  const approvalId = String(formData.get("approvalId") ?? "");
  const decision = String(formData.get("decision") ?? "");
  const comment = String(formData.get("comment") ?? "").trim() || null;
  if (!["APPROVED", "REJECTED"].includes(decision)) return;

  const approval = await db.ticketApproval.findUnique({
    where: { id: approvalId },
    include: { ticket: { include: { requester: true, service: true } } },
  });
  if (!approval || approval.status !== "PENDING") return;
  // only the assigned approver (or an admin) may decide
  if (approval.approverId !== me.id && me.role !== "ADMIN") return;
  // separation of duties: you can never approve your own request, even as admin
  if (approval.ticket.requesterId === me.id) return;

  await db.ticketApproval.update({
    where: { id: approvalId },
    data: { status: decision, comment, decidedAt: new Date() },
  });

  const approved = decision === "APPROVED";
  const t = approval.ticket;
  await db.ticket.update({
    where: { id: t.id },
    data: {
      approvalState: decision,
      status: approved ? "NEW" : "CANCELLED",
      ...(approved ? {} : { closedAt: new Date() }),
    },
  });
  await db.ticketComment.create({
    data: {
      ticketId: t.id, authorId: me.id, isInternal: true,
      body: `${approved ? "Approved" : "Rejected"} the request${comment ? `: ${comment}` : "."}`,
    },
  });
  await writeAudit({ userId: me.id, action: "UPDATE", entity: "Ticket", entityId: t.id, summary: approved ? "Approved request" : "Rejected request" });

  await notify(t.requesterId, {
    type: "APPROVAL_RESULT",
    title: approved ? "Your request was approved" : "Your request was declined",
    body: `${t.service?.name ?? t.title}`,
    entity: "Ticket",
    entityId: String(t.id),
  });
  if (t.requester?.email) {
    await sendMail({
      to: t.requester.email, toName: t.requester.name, entity: "Ticket", entityId: t.id,
      template: approved ? "request_approved" : "request_rejected",
      subject: `[${ticketRef(t.id, t.type)}] Your request was ${approved ? "approved" : "declined"}`,
      body: `Hello,\n\nYour request "${t.title}" has been ${approved ? "approved and is now being actioned" : "declined"}${comment ? `:\n\n${comment}` : "."}\n\n— Servio Service Desk`,
    });
  }

  revalidatePath("/approvals");
  revalidatePath(`/tickets/${t.id}`);
  revalidatePath(`/portal/tickets/${t.id}`);
}
