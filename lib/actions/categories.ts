"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { db } from "@/lib/db";
import { getSessionUser } from "@/lib/session";
import { writeAudit } from "@/lib/audit";
import { CATEGORY_TYPES } from "@/lib/constants";

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
  type: z.enum(CATEGORY_TYPES),
  parentId: optionalId,
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
      type: data.type,
      parentId: data.parentId,
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
  type: z.enum(CATEGORY_TYPES),
  parentId: optionalId,
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
      type: data.type,
      parentId,
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
