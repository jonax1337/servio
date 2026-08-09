"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { db } from "@/lib/db";
import { getCurrentUser, hasRole, type Role } from "@/lib/session";
import { writeAudit } from "@/lib/audit";
import { PRIORITIES } from "@/lib/constants";

// DB-truth (not the stale JWT): a demoted/deactivated manager must lose write access
// immediately, consistent with the requireRole gate on the pages.
async function requireManager() {
  const me = await getCurrentUser();
  return me && me.isActive && hasRole(me.role as Role, "MANAGER") ? me : null;
}

const nameTaken = (e: unknown) =>
  typeof e === "object" && e !== null && (e as { code?: string }).code === "P2002";

export type SlaState =
  | { ok?: boolean; error?: string; fieldErrors?: Record<string, string[]> }
  | undefined;

const schema = z.object({
  name: z.string().min(2, "Name must be at least 2 characters").max(80),
  description: z.string().optional().default(""),
  priority: z.enum(PRIORITIES).nullable().optional(),
  responseMins: z.coerce.number().int().min(1, "Must be at least 1 minute").max(1_000_000),
  resolveMins: z.coerce.number().int().min(1, "Must be at least 1 minute").max(1_000_000),
  isActive: z.boolean().default(true),
});

function parse(formData: FormData) {
  const priorityRaw = String(formData.get("priority") ?? "");
  return schema.safeParse({
    name: String(formData.get("name") ?? ""),
    description: String(formData.get("description") ?? ""),
    priority: priorityRaw && priorityRaw !== "none" ? priorityRaw : null,
    responseMins: String(formData.get("responseMins") ?? ""),
    resolveMins: String(formData.get("resolveMins") ?? ""),
    isActive: formData.get("isActive") !== "false",
  });
}

export async function createSla(_prev: SlaState, formData: FormData): Promise<SlaState> {
  const me = await requireManager();
  if (!me) return { error: "You need manager access to manage SLAs." };
  const parsed = parse(formData);
  if (!parsed.success) return { error: "Please fix the errors below.", fieldErrors: parsed.error.flatten().fieldErrors };
  const d = parsed.data;

  // SLA.name is unique — surface a friendly message on collision (pre-check for the
  // common case, catch P2002 for the concurrent race).
  const clash = await db.sLA.findUnique({ where: { name: d.name }, select: { id: true } });
  if (clash) return { error: "An SLA with that name already exists.", fieldErrors: { name: ["Name must be unique"] } };

  try {
    const sla = await db.sLA.create({
      data: {
        name: d.name,
        description: d.description || null,
        priority: d.priority ?? null,
        responseMins: d.responseMins,
        resolveMins: d.resolveMins,
        isActive: d.isActive,
      },
    });
    await writeAudit({ userId: me.id, action: "CREATE", entity: "SLA", entityId: sla.id, summary: `Created SLA "${sla.name}"` });
  } catch (e) {
    if (nameTaken(e)) return { error: "An SLA with that name already exists.", fieldErrors: { name: ["Name must be unique"] } };
    throw e;
  }
  revalidatePath("/settings/sla");
  return { ok: true };
}

export async function updateSla(_prev: SlaState, formData: FormData): Promise<SlaState> {
  const me = await requireManager();
  if (!me) return { error: "You need manager access to manage SLAs." };
  const id = String(formData.get("id") ?? "");
  if (!id) return { error: "Missing SLA id." };
  const parsed = parse(formData);
  if (!parsed.success) return { error: "Please fix the errors below.", fieldErrors: parsed.error.flatten().fieldErrors };
  const d = parsed.data;

  const clash = await db.sLA.findFirst({ where: { name: d.name, NOT: { id } }, select: { id: true } });
  if (clash) return { error: "An SLA with that name already exists.", fieldErrors: { name: ["Name must be unique"] } };

  try {
    await db.sLA.update({
      where: { id },
      data: {
        name: d.name,
        description: d.description || null,
        priority: d.priority ?? null,
        responseMins: d.responseMins,
        resolveMins: d.resolveMins,
        isActive: d.isActive,
      },
    });
    await writeAudit({ userId: me.id, action: "UPDATE", entity: "SLA", entityId: id, summary: `Updated SLA "${d.name}"` });
  } catch (e) {
    if (nameTaken(e)) return { error: "An SLA with that name already exists.", fieldErrors: { name: ["Name must be unique"] } };
    throw e;
  }
  revalidatePath("/settings/sla");
  return { ok: true };
}

export async function toggleSla(formData: FormData) {
  const me = await requireManager();
  if (!me) return;
  const id = String(formData.get("id") ?? "");
  const sla = await db.sLA.findUnique({ where: { id } });
  if (!sla) return;
  await db.sLA.update({ where: { id }, data: { isActive: !sla.isActive } });
  await writeAudit({ userId: me.id, action: "UPDATE", entity: "SLA", entityId: id, summary: `${sla.isActive ? "Deactivated" : "Activated"} SLA "${sla.name}"` });
  revalidatePath("/settings/sla");
}

export async function deleteSla(formData: FormData) {
  const me = await requireManager();
  if (!me) return;
  const id = String(formData.get("id") ?? "");
  const sla = await db.sLA.findUnique({ where: { id }, select: { name: true } });
  if (!sla) return;
  // Detach references first so the delete can't fail on a foreign key. Existing
  // tickets keep their already-stamped deadlines (the commitment stands) — only
  // the SLA link is removed.
  await db.ticket.updateMany({ where: { slaId: id }, data: { slaId: null } });
  await db.service.updateMany({ where: { slaId: id }, data: { slaId: null } });
  try {
    await db.sLA.delete({ where: { id } });
    // Audit only a delete that actually happened.
    await writeAudit({ userId: me.id, action: "DELETE", entity: "SLA", entityId: id, summary: `Deleted SLA "${sla.name}"` });
  } catch {
    // already gone / concurrent delete — nothing to record
  }
  revalidatePath("/settings/sla");
}
