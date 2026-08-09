"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { db } from "@/lib/db";
import { getSessionUser, isAgent, type Role } from "@/lib/session";
import { writeAudit, notify } from "@/lib/audit";
import { readRichBody, readRichField } from "@/lib/markdown";
import {
  PROBLEM_STATUSES,
  PRIORITIES,
  IMPACT_URGENCY,
} from "@/lib/constants";

const optionalId = z
  .string()
  .optional()
  .transform((v) => (v && v !== "none" && v !== "" ? v : null));

const createSchema = z.object({
  title: z.string().min(3, "Title must be at least 3 characters"),
  description: z.string().default(""),
  status: z.enum(PROBLEM_STATUSES).default("NEW"),
  priority: z.enum(PRIORITIES),
  impact: z.enum(IMPACT_URGENCY),
  assigneeId: optionalId,
  groupId: optionalId,
  categoryId: optionalId,
});

export type ActionState = { error?: string; fieldErrors?: Record<string, string[]> } | undefined;

export async function createProblem(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const me = await getSessionUser();
  if (!me) return { error: "Not authenticated" };

  const parsed = createSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) {
    return { error: "Please fix the errors below.", fieldErrors: parsed.error.flatten().fieldErrors };
  }
  const data = parsed.data;

  const problem = await db.problem.create({ data });

  await writeAudit({ userId: me.id, action: "CREATE", entity: "Problem", entityId: problem.id, summary: `Created problem "${problem.title}"` });
  if (data.assigneeId && data.assigneeId !== me.id) {
    await notify(data.assigneeId, { type: "ASSIGNED", title: "Problem assigned to you", body: problem.title, entity: "Problem", entityId: String(problem.id) });
  }

  revalidatePath("/problems");
  redirect(`/problems/${problem.id}`);
}

const updateSchema = z.object({
  id: z.coerce.number(),
  field: z.enum([
    "status", "priority", "impact",
    "assigneeId", "groupId", "categoryId",
  ]),
  value: z.string(),
});

export async function updateProblemField(formData: FormData) {
  const me = await getSessionUser();
  if (!me) return;
  const parsed = updateSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return;
  const { id, field, value } = parsed.data;

  const isRelation = field.endsWith("Id");
  const v = isRelation && (value === "none" || value === "") ? null : value;

  const patch: Record<string, unknown> = { [field]: v };
  if (field === "status") {
    if (value === "RESOLVED" || value === "CLOSED") patch.resolvedAt = new Date();
    if (value === "NEW" || value === "INVESTIGATING" || value === "KNOWN_ERROR") patch.resolvedAt = null;
  }

  await db.problem.update({ where: { id }, data: patch });
  await writeAudit({ userId: me.id, action: "UPDATE", entity: "Problem", entityId: id, summary: `Updated ${field}` });
  revalidatePath(`/problems/${id}`);
  revalidatePath("/problems");
}

// ── Comments & edit ──────────────────────────────────────────────────────────

async function requireAgentP() {
  const me = await getSessionUser();
  return me && isAgent(me.role as Role) ? me : null;
}

export async function addProblemComment(formData: FormData) {
  const me = await requireAgentP();
  if (!me) return;
  const id = Number(formData.get("problemId"));
  const isInternal = formData.get("isInternal") === "on";
  const { body, bodyHtml } = readRichBody(formData);
  if (!id || !body) return;
  await db.problemComment.create({ data: { problemId: id, authorId: me.id, body, bodyHtml, isInternal } });
  await db.problem.update({ where: { id }, data: { updatedAt: new Date() } });
  await writeAudit({ userId: me.id, action: "UPDATE", entity: "Problem", entityId: id, summary: "Added a comment" });
  revalidatePath(`/problems/${id}`);
}

export async function updateProblemDetails(formData: FormData) {
  const me = await requireAgentP();
  if (!me) return;
  const id = Number(formData.get("id"));
  const title = String(formData.get("title") ?? "").trim();
  if (!id || title.length < 3) return;
  const { text: description, html: descriptionHtml } = readRichField(formData, "descriptionHtml", "description");
  await db.problem.update({ where: { id }, data: { title, description, descriptionHtml } });
  await writeAudit({ userId: me.id, action: "UPDATE", entity: "Problem", entityId: id, summary: "Edited details" });
  revalidatePath(`/problems/${id}`);
  revalidatePath("/problems");
}
