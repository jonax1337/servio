"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { db } from "@/lib/db";
import { getSessionUser } from "@/lib/session";
import { writeAudit } from "@/lib/audit";

const optionalId = z
  .string()
  .optional()
  .transform((v) => (v && v !== "none" && v !== "" ? v : null));

const optionalText = z
  .string()
  .optional()
  .transform((v) => (v && v.trim() !== "" ? v.trim() : null));

const createSchema = z.object({
  name: z.string().min(2, "Name must be at least 2 characters"),
  parentId: optionalId,
  groupId: optionalId,
  color: z
    .string()
    .regex(/^#[0-9a-fA-F]{6}$/, "Use a hex color like #64748b")
    .default("#64748b"),
  description: optionalText,
});

export type ActionState =
  | { error?: string; fieldErrors?: Record<string, string[]> }
  | undefined;

export async function createCategory(
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

  const category = await db.category.create({
    data: {
      name: data.name,
      parentId: data.parentId,
      groupId: data.groupId,
      color: data.color,
      description: data.description,
    },
  });

  await writeAudit({
    userId: me.id,
    action: "CREATE",
    entity: "Category",
    entityId: category.id,
    summary: `Created category "${category.name}"`,
  });

  revalidatePath("/categories");
  redirect("/categories");
}

const updateSchema = z.object({
  id: z.string().min(1),
  name: z.string().min(2, "Name must be at least 2 characters"),
  parentId: optionalId,
  groupId: optionalId,
  color: z
    .string()
    .regex(/^#[0-9a-fA-F]{6}$/, "Use a hex color like #64748b")
    .default("#64748b"),
  description: optionalText,
});

export async function updateCategory(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const me = await getSessionUser();
  if (!me) return { error: "Not authenticated" };

  const parsed = updateSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) {
    return {
      error: "Please fix the errors below.",
      fieldErrors: parsed.error.flatten().fieldErrors,
    };
  }
  const { id, ...data } = parsed.data;

  // A category cannot be its own parent.
  const parentId = data.parentId === id ? null : data.parentId;

  await db.category.update({
    where: { id },
    data: {
      name: data.name,
      parentId,
      groupId: data.groupId,
      color: data.color,
      description: data.description,
    },
  });

  await writeAudit({
    userId: me.id,
    action: "UPDATE",
    entity: "Category",
    entityId: id,
    summary: `Updated category "${data.name}"`,
  });

  revalidatePath("/categories");
  redirect("/categories");
}

/** Toggle a category's archived flag (soft-hide from pickers/portal, keep history). */
export async function setCategoryArchived(formData: FormData): Promise<void> {
  const me = await getSessionUser();
  if (!me) return;
  const id = String(formData.get("id") ?? "");
  const archived = String(formData.get("archived") ?? "") === "true";
  if (!id) return;

  await db.category.update({ where: { id }, data: { archived } });
  await writeAudit({
    userId: me.id,
    action: "UPDATE",
    entity: "Category",
    entityId: id,
    summary: archived ? "Archived category" : "Restored category",
  });
  revalidatePath("/categories");
}

/**
 * Hard-delete a category. Blocked while it still has subcategories or is
 * referenced anywhere (tickets, services, catalog items, …) — archive instead.
 */
export async function deleteCategory(formData: FormData): Promise<{ error?: string } | void> {
  const me = await getSessionUser();
  if (!me) return { error: "Not authorised" };
  const id = String(formData.get("id") ?? "");
  if (!id) return;

  const cat = await db.category.findUnique({
    where: { id },
    select: {
      name: true,
      _count: { select: { children: true, tickets: true, problems: true, changes: true, services: true, articles: true, catalogItems: true } },
    },
  });
  if (!cat) return; // already gone (idempotent)

  const c = cat._count;
  if (c.children > 0) return { error: "Move or remove its subcategories first." };
  const refs = c.tickets + c.problems + c.changes + c.services + c.articles + c.catalogItems;
  if (refs > 0) return { error: `In use by ${refs} record${refs === 1 ? "" : "s"} — archive it instead of deleting.` };

  await db.category.delete({ where: { id } });
  await writeAudit({ userId: me.id, action: "DELETE", entity: "Category", entityId: id, summary: `Deleted category "${cat.name}"` });
  revalidatePath("/categories");
}
