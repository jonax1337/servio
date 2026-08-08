"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { db } from "@/lib/db";
import { getSessionUser, isAgent, type Role } from "@/lib/session";
import { writeAudit } from "@/lib/audit";
import { LOCATION_TYPES } from "@/lib/constants";

async function requireAgent() {
  const me = await getSessionUser();
  return me && isAgent(me.role as Role) ? me : null;
}

const opt = (v: FormDataEntryValue | null) => {
  const s = String(v ?? "").trim();
  return s ? s : null;
};

const schema = z.object({
  name: z.string().min(2, "Name is required"),
  type: z.enum(LOCATION_TYPES),
});

export type LocationState = { error?: string } | undefined;

export async function createLocation(_prev: LocationState, formData: FormData): Promise<LocationState> {
  const me = await requireAgent();
  if (!me) return { error: "Not authorised" };
  const parsed = schema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "Invalid" };
  const parentId = opt(formData.get("parentId"));
  const loc = await db.location.create({
    data: {
      name: parsed.data.name,
      type: parsed.data.type,
      parentId: parentId && parentId !== "none" ? parentId : null,
      address: opt(formData.get("address")),
      city: opt(formData.get("city")),
      country: opt(formData.get("country")),
      notes: opt(formData.get("notes")),
    },
  });
  await writeAudit({ userId: me.id, action: "CREATE", entity: "Location", entityId: loc.id, summary: `Created location "${loc.name}"` });
  revalidatePath("/locations");
  return undefined;
}

export async function updateLocation(_prev: LocationState, formData: FormData): Promise<LocationState> {
  const me = await requireAgent();
  if (!me) return { error: "Not authorised" };
  const id = String(formData.get("id") ?? "");
  if (!id) return { error: "Missing id" };
  const parsed = schema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "Invalid" };
  const parentId = opt(formData.get("parentId"));
  await db.location.update({
    where: { id },
    data: {
      name: parsed.data.name,
      type: parsed.data.type,
      parentId: parentId && parentId !== "none" && parentId !== id ? parentId : null,
      address: opt(formData.get("address")),
      city: opt(formData.get("city")),
      country: opt(formData.get("country")),
      notes: opt(formData.get("notes")),
    },
  });
  await writeAudit({ userId: me.id, action: "UPDATE", entity: "Location", entityId: id, summary: "Edited location" });
  revalidatePath("/locations");
  revalidatePath(`/locations/${id}`);
  return undefined;
}

export async function deleteLocation(formData: FormData) {
  const me = await requireAgent();
  if (!me) return;
  const id = String(formData.get("id") ?? "");
  // detach assets & children first (SetNull not configured, so do it manually)
  await db.asset.updateMany({ where: { locationId: id }, data: { locationId: null } });
  await db.location.updateMany({ where: { parentId: id }, data: { parentId: null } });
  await db.location.delete({ where: { id } }).catch(() => {});
  revalidatePath("/locations");
}
