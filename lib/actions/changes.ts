"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { db } from "@/lib/db";
import { getSessionUser, isAgent, type Role } from "@/lib/session";
import { writeAudit, notify } from "@/lib/audit";
import {
  changeRef,
  CHANGE_TYPES,
  RISKS,
  PRIORITIES,
  IMPACT_URGENCY,
} from "@/lib/constants";

const optionalId = z
  .string()
  .optional()
  .transform((v) => (v && v !== "none" && v !== "" ? v : null));

const optionalText = z
  .string()
  .optional()
  .transform((v) => (v && v.trim() !== "" ? v.trim() : null));

const optionalDate = z
  .string()
  .optional()
  .transform((v) => (v && v.trim() !== "" ? new Date(v) : null));

const createSchema = z.object({
  title: z.string().min(3, "Title must be at least 3 characters"),
  description: z.string().default(""),
  type: z.enum(CHANGE_TYPES),
  risk: z.enum(RISKS),
  priority: z.enum(PRIORITIES),
  impact: z.enum(IMPACT_URGENCY),
  reason: optionalText,
  implementationPlan: optionalText,
  rollbackPlan: optionalText,
  assigneeId: optionalId,
  groupId: optionalId,
  categoryId: optionalId,
  plannedStart: optionalDate,
  plannedEnd: optionalDate,
});

export type ActionState =
  | { error?: string; fieldErrors?: Record<string, string[]> }
  | undefined;

export async function createChange(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const me = await getSessionUser();
  if (!me) return { error: "Not authenticated" };

  const parsed = createSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) {
    return {
      error: "Please fix the errors below.",
      fieldErrors: parsed.error.flatten().fieldErrors,
    };
  }
  const data = parsed.data;

  const change = await db.change.create({
    data: { ...data, status: "DRAFT" },
  });

  await writeAudit({
    userId: me.id,
    action: "CREATE",
    entity: "Change",
    entityId: change.id,
    summary: `Created change "${change.title}"`,
  });
  if (data.assigneeId && data.assigneeId !== me.id) {
    await notify(data.assigneeId, {
      type: "ASSIGNED",
      title: "Change assigned to you",
      body: change.title,
      entity: "Change",
      entityId: String(change.id),
    });
  }

  revalidatePath("/changes");
  redirect(`/changes/${change.id}`);
}

const updateSchema = z.object({
  id: z.coerce.number(),
  field: z.enum(["status", "type", "risk", "priority", "assigneeId", "groupId", "categoryId"]),
  value: z.string(),
});

export async function updateChangeField(formData: FormData) {
  const me = await getSessionUser();
  if (!me) return;
  const parsed = updateSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return;
  const { id, field, value } = parsed.data;

  const isRelation = field.endsWith("Id");
  const v = isRelation && (value === "none" || value === "") ? null : value;

  await db.change.update({ where: { id }, data: { [field]: v } });
  await writeAudit({
    userId: me.id,
    action: "UPDATE",
    entity: "Change",
    entityId: id,
    summary: `Updated ${field}`,
  });
  revalidatePath(`/changes/${id}`);
  revalidatePath("/changes");
}

const decideSchema = z.object({
  approvalId: z.string().min(1),
  decision: z.enum(["APPROVED", "REJECTED"]),
  comment: z
    .string()
    .optional()
    .transform((v) => (v && v.trim() !== "" ? v.trim() : null)),
});

export async function decideApproval(formData: FormData) {
  const me = await getSessionUser();
  if (!me) return;
  const parsed = decideSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return;
  const { approvalId, decision, comment } = parsed.data;

  const approval = await db.changeApproval.update({
    where: { id: approvalId },
    data: { status: decision, comment, decidedAt: new Date() },
  });

  // When every approval is APPROVED, mark the change APPROVED.
  const approvals = await db.changeApproval.findMany({
    where: { changeId: approval.changeId },
    select: { status: true },
  });
  if (approvals.length > 0 && approvals.every((a) => a.status === "APPROVED")) {
    await db.change.update({
      where: { id: approval.changeId },
      data: { status: "APPROVED" },
    });
  } else if (decision === "REJECTED") {
    await db.change.update({
      where: { id: approval.changeId },
      data: { status: "REJECTED" },
    });
  }

  await writeAudit({
    userId: me.id,
    action: "UPDATE",
    entity: "Change",
    entityId: approval.changeId,
    summary: `Approval ${decision.toLowerCase()} on ${changeRef(approval.changeId)}`,
  });
  revalidatePath(`/changes/${approval.changeId}`);
  revalidatePath("/changes");
}

// ── Comments & edit ──────────────────────────────────────────────────────────

async function requireAgentC() {
  const me = await getSessionUser();
  return me && isAgent(me.role as Role) ? me : null;
}

export async function addChangeComment(formData: FormData) {
  const me = await requireAgentC();
  if (!me) return;
  const id = Number(formData.get("changeId"));
  const body = String(formData.get("body") ?? "").trim();
  const isInternal = formData.get("isInternal") === "on";
  if (!id || !body) return;
  await db.changeComment.create({ data: { changeId: id, authorId: me.id, body, isInternal } });
  await db.change.update({ where: { id }, data: { updatedAt: new Date() } });
  await writeAudit({ userId: me.id, action: "UPDATE", entity: "Change", entityId: id, summary: "Added a comment" });
  revalidatePath(`/changes/${id}`);
}

export async function updateChangeDetails(formData: FormData) {
  const me = await requireAgentC();
  if (!me) return;
  const id = Number(formData.get("id"));
  const title = String(formData.get("title") ?? "").trim();
  const description = String(formData.get("description") ?? "");
  if (!id || title.length < 3) return;
  await db.change.update({ where: { id }, data: { title, description } });
  await writeAudit({ userId: me.id, action: "UPDATE", entity: "Change", entityId: id, summary: "Edited details" });
  revalidatePath(`/changes/${id}`);
  revalidatePath("/changes");
}
