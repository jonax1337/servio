"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { db } from "@/lib/db";
import { getSessionUser, isAgent, type Role } from "@/lib/session";
import { writeAudit } from "@/lib/audit";
import { SERVICE_STATUSES, CRITICALITIES } from "@/lib/constants";

async function requireAgent() {
  const me = await getSessionUser();
  return me && isAgent(me.role as Role) ? me : null;
}

const optionalId = z
  .string()
  .optional()
  .transform((v) => (v && v !== "none" && v !== "" ? v : null));

const createSchema = z.object({
  name: z.string().min(2, "Name must be at least 2 characters"),
  description: z.string().default(""),
  status: z.enum(SERVICE_STATUSES).default("OPERATIONAL"),
  criticality: z.enum(CRITICALITIES).default("MEDIUM"),
  categoryId: optionalId,
  ownerId: optionalId,
  slaId: optionalId,
  groupId: optionalId,
});

export type ActionState =
  | { error?: string; fieldErrors?: Record<string, string[]> }
  | undefined;

export async function createService(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const me = await requireAgent();
  if (!me) return { error: "Not authorised" };

  const parsed = createSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) {
    return {
      error: "Please fix the errors below.",
      fieldErrors: parsed.error.flatten().fieldErrors,
    };
  }
  const data = parsed.data;

  const service = await db.service.create({ data });

  await writeAudit({
    userId: me.id,
    action: "CREATE",
    entity: "Service",
    entityId: service.id,
    summary: `Created service "${service.name}"`,
  });

  revalidatePath("/services");
  redirect(`/services/${service.id}`);
}

const updateSchema = z.object({
  id: z.string().min(1),
  field: z.enum(["status", "criticality", "categoryId", "ownerId", "slaId", "groupId"]),
  value: z.string(),
});

export async function updateServiceField(formData: FormData) {
  const me = await requireAgent();
  if (!me) return;
  const parsed = updateSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return;
  const { id, field, value } = parsed.data;

  const isRelation = field.endsWith("Id");
  const v = isRelation && (value === "none" || value === "") ? null : value;

  await db.service.update({ where: { id }, data: { [field]: v } });
  await writeAudit({
    userId: me.id,
    action: "UPDATE",
    entity: "Service",
    entityId: id,
    summary: `Updated ${field}`,
  });
  revalidatePath(`/services/${id}`);
  revalidatePath("/services");
}
