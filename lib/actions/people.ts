"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { db } from "@/lib/db";
import { getCurrentUser, hasRole, type Role } from "@/lib/session";
import { writeAudit } from "@/lib/audit";
import { ROLES } from "@/lib/constants";

const updateSchema = z.object({
  id: z.string().min(1),
  field: z.enum(["role", "isActive", "isVip"]),
  value: z.string(),
});

export async function updateUserField(formData: FormData) {
  // Fresh DB row (not the possibly-stale JWT): only active ADMINs may change
  // user role / activation. isVip is a lighter flag but we keep it admin-gated
  // here too since this is the People admin surface.
  const me = await getCurrentUser();
  if (!me || !me.isActive || !hasRole(me.role as Role, "ADMIN")) return;

  const parsed = updateSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return;
  const { id, field, value } = parsed.data;

  const target = await db.user.findUnique({ where: { id } });
  if (!target) return;

  // An admin must not lock themselves out or strip their own admin rights.
  if (id === me.id && (field === "role" || field === "isActive")) return;

  const patch: Record<string, unknown> = {};
  if (field === "role") {
    if (!ROLES.includes(value as (typeof ROLES)[number])) return;
    // Never demote the last remaining active admin.
    if (target.role === "ADMIN" && value !== "ADMIN" && (await lastActiveAdmin())) return;
    patch.role = value;
  } else if (field === "isVip") {
    patch.isVip = value === "true";
  } else {
    // Never deactivate the last remaining active admin.
    if (target.role === "ADMIN" && value !== "true" && (await lastActiveAdmin())) return;
    patch.isActive = value === "true";
  }

  await db.user.update({ where: { id }, data: patch });
  await writeAudit({
    userId: me.id,
    action: "UPDATE",
    entity: "User",
    entityId: id,
    summary: `Updated ${field}`,
  });

  revalidatePath(`/people/${id}`);
  revalidatePath("/people");
}

/** True when there is at most one active admin left (i.e. removing one is unsafe). */
async function lastActiveAdmin() {
  const count = await db.user.count({ where: { role: "ADMIN", isActive: true } });
  return count <= 1;
}
