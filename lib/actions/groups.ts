"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { db } from "@/lib/db";
import { getCurrentUser, hasRole, type Role } from "@/lib/session";
import { writeAudit } from "@/lib/audit";
import { GROUP_TYPES, AUTO_ASSIGN_STRATEGIES } from "@/lib/constants";

const optionalId = z
  .string()
  .optional()
  .transform((v) => (v && v !== "none" && v !== "" ? v : null));

const createSchema = z.object({
  name: z.string().min(2, "Name must be at least 2 characters"),
  type: z.enum(GROUP_TYPES),
  description: z
    .string()
    .optional()
    .transform((v) => (v && v.trim() !== "" ? v.trim() : null)),
  email: z
    .string()
    .optional()
    .transform((v) => (v && v.trim() !== "" ? v.trim() : null)),
  managerId: optionalId,
  autoAssign: z.enum(AUTO_ASSIGN_STRATEGIES).default("OFF"),
});

export type ActionState =
  | { error?: string; fieldErrors?: Record<string, string[]> }
  | undefined;

export async function createGroup(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  // DB-truth manager gate, consistent with setGroupAutoAssign (same config field).
  const me = await getCurrentUser();
  if (!me || !me.isActive || !hasRole(me.role as Role, "MANAGER")) return { error: "Not authorised" };

  const parsed = createSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) {
    return {
      error: "Please fix the errors below.",
      fieldErrors: parsed.error.flatten().fieldErrors,
    };
  }
  const data = parsed.data;

  const existing = await db.group.findUnique({ where: { name: data.name } });
  if (existing) {
    return {
      error: "A group with that name already exists.",
      fieldErrors: { name: ["Name must be unique"] },
    };
  }

  const group = await db.group.create({ data });

  await writeAudit({
    userId: me.id,
    action: "CREATE",
    entity: "Group",
    entityId: group.id,
    summary: `Created group "${group.name}"`,
  });

  revalidatePath("/groups");
  redirect(`/groups/${group.id}`);
}

/** Change a group's auto-assignment strategy (manager+). */
export async function setGroupAutoAssign(formData: FormData) {
  const me = await getCurrentUser();
  if (!me || !me.isActive || !hasRole(me.role as Role, "MANAGER")) return;
  const id = String(formData.get("id") ?? "");
  const strategy = String(formData.get("autoAssign") ?? "");
  if (!AUTO_ASSIGN_STRATEGIES.includes(strategy as (typeof AUTO_ASSIGN_STRATEGIES)[number])) return;
  const group = await db.group.findUnique({ where: { id }, select: { id: true } });
  if (!group) return;
  await db.group.update({ where: { id }, data: { autoAssign: strategy } });
  await writeAudit({ userId: me.id, action: "UPDATE", entity: "Group", entityId: id, summary: `Auto-assign set to ${strategy}` });
  revalidatePath(`/groups/${id}`);
}
