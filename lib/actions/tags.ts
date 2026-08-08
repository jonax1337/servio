"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { db } from "@/lib/db";
import { getSessionUser } from "@/lib/session";
import { writeAudit } from "@/lib/audit";

const createSchema = z.object({
  name: z.string().min(1, "Name is required").max(40),
  color: z.string().min(1).default("#64748b"),
});

export type ActionState =
  | { error?: string; fieldErrors?: Record<string, string[]> }
  | undefined;

export async function createTag(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const me = await getSessionUser();
  if (!me) return { error: "Not authenticated" };

  const parsed = createSchema.safeParse({
    name: formData.get("name"),
    color: formData.get("color") ?? "#64748b",
  });
  if (!parsed.success) {
    return {
      error: "Please fix the errors below.",
      fieldErrors: parsed.error.flatten().fieldErrors,
    };
  }

  const name = parsed.data.name.trim().replace(/^#/, "");
  if (!name) return { error: "Name is required" };

  const existing = await db.tag.findUnique({ where: { name } });
  if (existing) return { error: "A tag with that name already exists." };

  const tag = await db.tag.create({
    data: { name, color: parsed.data.color },
  });

  await writeAudit({
    userId: me.id,
    action: "CREATE",
    entity: "Tag",
    entityId: tag.id,
    summary: `Created tag "${tag.name}"`,
  });

  revalidatePath("/tags");
  return undefined;
}

export async function deleteTag(formData: FormData) {
  const me = await getSessionUser();
  if (!me) return;
  const id = String(formData.get("id") ?? "");
  if (!id) return;

  const tag = await db.tag.delete({ where: { id } });

  await writeAudit({
    userId: me.id,
    action: "DELETE",
    entity: "Tag",
    entityId: id,
    summary: `Deleted tag "${tag.name}"`,
  });

  revalidatePath("/tags");
}
