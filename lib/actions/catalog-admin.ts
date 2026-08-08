"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { db } from "@/lib/db";
import { getSessionUser, isAgent, hasRole, type Role } from "@/lib/session";
import { writeAudit } from "@/lib/audit";

async function requireManager() {
  const me = await getSessionUser();
  return me && hasRole(me.role as Role, "MANAGER") ? me : null;
}

const opt = (v: FormDataEntryValue | null) => {
  const s = String(v ?? "").trim();
  return s ? s : null;
};
const rel = (v: FormDataEntryValue | null) => {
  const s = String(v ?? "").trim();
  return s && s !== "none" ? s : null;
};

const schema = z.object({ name: z.string().min(2, "Name is required") });

export type CatalogAdminState = { error?: string } | undefined;

async function payload(formData: FormData, approverId: string | null) {
  let formSchema = "[]";
  try {
    const a = JSON.parse(String(formData.get("formSchema") ?? "[]"));
    formSchema = JSON.stringify(Array.isArray(a) ? a : []);
  } catch { formSchema = "[]"; }
  const days = parseInt(String(formData.get("estimatedDays") ?? ""), 10);
  return {
    name: String(formData.get("name")).trim(),
    description: opt(formData.get("description")),
    shortDescription: opt(formData.get("shortDescription")),
    icon: opt(formData.get("icon")),
    categoryId: rel(formData.get("categoryId")),
    estimatedDays: Number.isFinite(days) ? days : null,
    isPublished: formData.get("isPublished") !== "false",
    requiresApproval: formData.get("requiresApproval") === "true",
    approverId,
    formSchema,
  };
}

async function validApprover(formData: FormData) {
  const raw = rel(formData.get("approverId"));
  if (!raw) return null;
  const u = await db.user.findUnique({ where: { id: raw }, select: { role: true } });
  return u && isAgent(u.role as Role) ? raw : null;
}

export async function createCatalogItem(_prev: CatalogAdminState, formData: FormData): Promise<CatalogAdminState> {
  const me = await requireManager();
  if (!me) return { error: "Not authorised" };
  const parsed = schema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "Invalid" };
  const count = await db.catalogItem.count();
  const item = await db.catalogItem.create({ data: { ...(await payload(formData, await validApprover(formData))), order: count } });
  await writeAudit({ userId: me.id, action: "CREATE", entity: "CatalogItem", entityId: item.id, summary: `Created catalog item "${item.name}"` });
  revalidatePath("/catalog");
  return undefined;
}

export async function updateCatalogItem(_prev: CatalogAdminState, formData: FormData): Promise<CatalogAdminState> {
  const me = await requireManager();
  if (!me) return { error: "Not authorised" };
  const id = String(formData.get("id") ?? "");
  if (!id) return { error: "Missing id" };
  const parsed = schema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "Invalid" };
  await db.catalogItem.update({ where: { id }, data: await payload(formData, await validApprover(formData)) });
  await writeAudit({ userId: me.id, action: "UPDATE", entity: "CatalogItem", entityId: id, summary: "Updated catalog item" });
  revalidatePath("/catalog");
  return undefined;
}

export async function toggleCatalogPublished(formData: FormData) {
  const me = await requireManager();
  if (!me) return;
  const id = String(formData.get("id") ?? "");
  const item = await db.catalogItem.findUnique({ where: { id } });
  if (!item) return;
  await db.catalogItem.update({ where: { id }, data: { isPublished: !item.isPublished } });
  revalidatePath("/catalog");
}

export async function deleteCatalogItem(formData: FormData) {
  const me = await requireManager();
  if (!me) return;
  const id = String(formData.get("id") ?? "");
  await db.catalogItem.delete({ where: { id } }).catch(() => {});
  revalidatePath("/catalog");
}
