"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { db } from "@/lib/db";
import { getSessionUser, isAgent, type Role } from "@/lib/session";
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

// ── Full edit with field-level history ──────────────────────────────────────

async function requireAgentA() {
  const me = await getSessionUser();
  return me && isAgent(me.role as Role) ? me : null;
}

const str = (v: FormDataEntryValue | null) => {
  const s = String(v ?? "").trim();
  return s ? s : null;
};
const num = (v: FormDataEntryValue | null) => {
  const s = String(v ?? "").trim();
  return s && !Number.isNaN(Number(s)) ? Number(s) : null;
};
const dat = (v: FormDataEntryValue | null) => {
  const s = String(v ?? "").trim();
  return s ? new Date(s) : null;
};
const rel = (v: FormDataEntryValue | null) => {
  const s = String(v ?? "").trim();
  return s && s !== "none" ? s : null;
};

export async function updateAsset(formData: FormData) {
  const me = await requireAgentA();
  if (!me) return;
  const id = String(formData.get("id") ?? "");
  const existing = await db.asset.findUnique({ where: { id } });
  if (!existing) return;

  const data = {
    name: String(formData.get("name") ?? existing.name).trim() || existing.name,
    assetTag: str(formData.get("assetTag")),
    type: String(formData.get("type") ?? existing.type),
    status: String(formData.get("status") ?? existing.status),
    serial: str(formData.get("serial")),
    model: str(formData.get("model")),
    manufacturer: str(formData.get("manufacturer")),
    os: str(formData.get("os")),
    cpu: str(formData.get("cpu")),
    ramGb: num(formData.get("ramGb")),
    storageGb: num(formData.get("storageGb")),
    ipAddress: str(formData.get("ipAddress")),
    macAddress: str(formData.get("macAddress")),
    location: str(formData.get("location")),
    locationId: rel(formData.get("locationId")),
    ownerId: rel(formData.get("ownerId")),
    groupId: rel(formData.get("groupId")),
    cost: num(formData.get("cost")),
    notes: str(formData.get("notes")),
    purchaseDate: dat(formData.get("purchaseDate")),
    warrantyEnd: dat(formData.get("warrantyEnd")),
  };

  // compute which fields changed for a readable audit trail
  const changed: string[] = [];
  for (const key of Object.keys(data) as (keyof typeof data)[]) {
    const before = (existing as Record<string, unknown>)[key];
    const after = data[key];
    const norm = (x: unknown) => (x instanceof Date ? x.toISOString().slice(0, 10) : x ?? null);
    if (norm(before) !== norm(after)) changed.push(key);
  }

  await db.asset.update({ where: { id }, data });
  await writeAudit({
    userId: me.id,
    action: "UPDATE",
    entity: "Asset",
    entityId: id,
    summary: changed.length ? `Edited ${changed.join(", ")}` : "Saved (no changes)",
    meta: { changed },
  });
  revalidatePath(`/assets/${id}`);
  revalidatePath("/assets");
}
