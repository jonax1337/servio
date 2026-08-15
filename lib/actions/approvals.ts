"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { db } from "@/lib/db";
import { getSessionUser, isAgent, hasRole, type Role } from "@/lib/session";
import { writeAudit, notify } from "@/lib/audit";
import { sendMail } from "@/lib/mail";
import { resumeData } from "@/lib/sla";
import { autoAssignTicket } from "@/lib/assignment";
import { ticketRef, APPROVAL_ENTITY_TYPES, APPROVAL_ENTITY_META, type ApprovalEntityType } from "@/lib/constants";

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
  // Approval resumes the SLA clock (it was paused while PENDING approval).
  const resume = approved && t.pendingSince ? resumeData(t) : {};
  await db.ticket.update({
    where: { id: t.id },
    data: {
      approvalState: decision,
      status: approved ? "NEW" : "CANCELLED",
      ...(approved ? {} : { closedAt: new Date() }),
      ...resume,
    },
  });
  await db.ticketComment.create({
    data: {
      ticketId: t.id, authorId: me.id, isInternal: true,
      body: `${approved ? "Approved" : "Rejected"} the request${comment ? `: ${comment}` : "."}`,
    },
  });
  await writeAudit({ userId: me.id, action: "UPDATE", entity: "Ticket", entityId: t.id, summary: approved ? "Approved request" : "Rejected request" });

  // Once approved, the request is live work — auto-assign it from its group.
  if (approved) await autoAssignTicket(t.id);

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

// ═══════════════════════════════════════════════════════════════════════════
// Generic ad-hoc approvals (polymorphic Approval model)
//
// These sit alongside — not on top of — the two automated flows: the Change
// CAB (lib/actions/changes.ts) and catalog ticket approvals (decideApproval
// above). An agent can request a sign-off from a colleague on ANY entity; it's
// a governance record + notification and never drives the entity's lifecycle.
// ═══════════════════════════════════════════════════════════════════════════

function entityPath(entityType: ApprovalEntityType, entityId: string) {
  return `${APPROVAL_ENTITY_META[entityType].path}/${entityId}`;
}

const requestSchema = z.object({
  entityType: z.enum(APPROVAL_ENTITY_TYPES),
  entityId: z.string().min(1),
  approverId: z.string().min(1),
  title: z
    .string()
    .optional()
    .transform((v) => (v && v.trim() !== "" ? v.trim() : "")),
});

/** Request an ad-hoc approval from a colleague on any entity (agent+). */
export async function requestApproval(formData: FormData) {
  const me = await getSessionUser();
  if (!me || !isAgent(me.role as Role)) return;
  const parsed = requestSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return;
  const { entityType, entityId, approverId, title } = parsed.data;

  // Separation of duties: you can't request an approval from yourself.
  if (approverId === me.id) return;
  const approver = await db.user.findUnique({ where: { id: approverId }, select: { id: true, name: true, email: true, isActive: true } });
  if (!approver || !approver.isActive) return;

  // Idempotent on the [entityType, entityId, approverId] unique — re-requesting
  // just refreshes a superseded decision back to pending.
  await db.approval.upsert({
    where: { entityType_entityId_approverId: { entityType, entityId, approverId } },
    create: { entityType, entityId, approverId, requestedById: me.id, title, status: "PENDING" },
    update: { requestedById: me.id, title, status: "PENDING", comment: null, decidedAt: null },
  });

  await notify(approverId, {
    type: "APPROVAL",
    title: "Approval requested",
    body: title || `${APPROVAL_ENTITY_META[entityType].label} approval`,
    entity: APPROVAL_ENTITY_META[entityType].label,
    entityId,
  });
  await writeAudit({ userId: me.id, action: "UPDATE", entity: APPROVAL_ENTITY_META[entityType].label, entityId, summary: `Requested approval from ${approver.name ?? approver.email}` });
  revalidatePath(entityPath(entityType, entityId));
  revalidatePath("/approvals");
}

const decideEntitySchema = z.object({
  approvalId: z.string().min(1),
  decision: z.enum(["APPROVED", "REJECTED"]),
  comment: z
    .string()
    .optional()
    .transform((v) => (v && v.trim() !== "" ? v.trim() : null)),
});

/** Decide an ad-hoc approval. Only the assigned approver (or an admin) may act,
 *  and never on a sign-off they requested themselves (SoD). */
export async function decideEntityApproval(formData: FormData) {
  const me = await getSessionUser();
  if (!me || !isAgent(me.role as Role)) return;
  const parsed = decideEntitySchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return;
  const { approvalId, decision, comment } = parsed.data;

  const approval = await db.approval.findUnique({ where: { id: approvalId } });
  if (!approval || approval.status !== "PENDING") return;
  if (approval.approverId !== me.id && me.role !== "ADMIN") return;
  if (approval.requestedById === me.id) return; // never decide your own request

  await db.approval.update({ where: { id: approvalId }, data: { status: decision, comment, decidedAt: new Date() } });

  const entityType = approval.entityType as ApprovalEntityType;
  const meta = APPROVAL_ENTITY_META[entityType];
  if (approval.requestedById) {
    await notify(approval.requestedById, {
      type: "APPROVAL_RESULT",
      title: decision === "APPROVED" ? "Approval granted" : "Approval declined",
      body: approval.title || `${meta.label} approval`,
      entity: meta.label,
      entityId: approval.entityId,
    });
  }
  await writeAudit({ userId: me.id, action: "UPDATE", entity: meta.label, entityId: approval.entityId, summary: `Approval ${decision.toLowerCase()}` });
  revalidatePath(entityPath(entityType, approval.entityId));
  revalidatePath("/approvals");
}

/** Withdraw a pending ad-hoc approval. The requester or a manager+ may cancel. */
export async function cancelApproval(formData: FormData) {
  const me = await getSessionUser();
  if (!me || !isAgent(me.role as Role)) return;
  const approvalId = String(formData.get("approvalId") ?? "");
  const approval = await db.approval.findUnique({ where: { id: approvalId } });
  if (!approval) return;
  if (approval.requestedById !== me.id && !hasRole(me.role as Role, "MANAGER")) return;

  await db.approval.delete({ where: { id: approvalId } });
  const entityType = approval.entityType as ApprovalEntityType;
  await writeAudit({ userId: me.id, action: "UPDATE", entity: APPROVAL_ENTITY_META[entityType].label, entityId: approval.entityId, summary: "Cancelled approval request" });
  revalidatePath(entityPath(entityType, approval.entityId));
  revalidatePath("/approvals");
}
