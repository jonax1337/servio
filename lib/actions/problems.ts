"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { db } from "@/lib/db";
import { getSessionUser } from "@/lib/session";
import { writeAudit, notify } from "@/lib/audit";
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
