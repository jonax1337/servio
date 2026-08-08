"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { db } from "@/lib/db";
import { getSessionUser } from "@/lib/session";
import { writeAudit } from "@/lib/audit";
import { ROLES } from "@/lib/constants";

const updateSchema = z.object({
  id: z.string().min(1),
  field: z.enum(["role", "isActive", "isVip"]),
  value: z.string(),
});

export async function updateUserField(formData: FormData) {
  const me = await getSessionUser();
  if (!me) return;

  const parsed = updateSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return;
  const { id, field, value } = parsed.data;

  const patch: Record<string, unknown> = {};
  if (field === "role") {
    if (!ROLES.includes(value as (typeof ROLES)[number])) return;
    patch.role = value;
  } else if (field === "isVip") {
    patch.isVip = value === "true";
  } else {
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
