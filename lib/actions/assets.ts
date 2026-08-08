"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { db } from "@/lib/db";
import { getSessionUser } from "@/lib/session";
import { writeAudit } from "@/lib/audit";
import { ASSET_TYPES, ASSET_STATUSES } from "@/lib/constants";

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
  type: z.enum(ASSET_TYPES),
  status: z.enum(ASSET_STATUSES).default("IN_USE"),
  assetTag: optionalText,
  serial: optionalText,
  model: optionalText,
  manufacturer: optionalText,
  location: optionalText,
  ipAddress: optionalText,
  os: optionalText,
  ownerId: optionalId,
  groupId: optionalId,
});

export type ActionState =
  | { error?: string; fieldErrors?: Record<string, string[]> }
  | undefined;

export async function createAsset(
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

  const asset = await db.asset.create({ data });

  await writeAudit({
    userId: me.id,
    action: "CREATE",
    entity: "Asset",
    entityId: asset.id,
    summary: `Created asset "${asset.name}"`,
  });

  revalidatePath("/assets");
  redirect(`/assets/${asset.id}`);
}

const updateSchema = z.object({
  id: z.string().min(1),
  field: z.enum(["status", "ownerId", "groupId"]),
  value: z.string(),
});

export async function updateAssetField(formData: FormData) {
  const me = await getSessionUser();
  if (!me) return;
  const parsed = updateSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return;
  const { id, field, value } = parsed.data;

  const isRelation = field.endsWith("Id");
  const v = isRelation && (value === "none" || value === "") ? null : value;

  await db.asset.update({ where: { id }, data: { [field]: v } });
  await writeAudit({
    userId: me.id,
    action: "UPDATE",
    entity: "Asset",
    entityId: id,
    summary: `Updated ${field}`,
  });
  revalidatePath(`/assets/${id}`);
  revalidatePath("/assets");
}
