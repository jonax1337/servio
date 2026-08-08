"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { db } from "@/lib/db";
import { getSessionUser, hasRole, type Role } from "@/lib/session";
import { writeAudit } from "@/lib/audit";
import { TRIGGERS, MATCH_TYPES } from "@/lib/automation-defs";

async function requireManager() {
  const me = await getSessionUser();
  return me && hasRole(me.role as Role, "MANAGER") ? me : null;
}

const schema = z.object({
  name: z.string().min(2, "Name is required"),
  description: z.string().optional().transform((v) => (v?.trim() ? v.trim() : null)),
  trigger: z.enum(TRIGGERS.map((t) => t.value) as [string, ...string[]]),
  matchType: z.enum(MATCH_TYPES.map((t) => t.value) as [string, ...string[]]),
  conditions: z.string().default("[]"),
  actions: z.string().default("[]"),
  isActive: z.string().optional(),
});

export type RuleState = { error?: string } | undefined;

function normalizeJson(s: string) {
  try {
    const a = JSON.parse(s);
    return JSON.stringify(Array.isArray(a) ? a : []);
  } catch {
    return "[]";
  }
}

export async function createRule(_prev: RuleState, formData: FormData): Promise<RuleState> {
  const me = await requireManager();
  if (!me) return { error: "Not authorised" };
  const parsed = schema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "Invalid rule" };
  const d = parsed.data;
  const count = await db.automationRule.count();
  const rule = await db.automationRule.create({
    data: {
      name: d.name,
      description: d.description,
      trigger: d.trigger,
      matchType: d.matchType,
      conditions: normalizeJson(d.conditions),
      actions: normalizeJson(d.actions),
      isActive: d.isActive !== "false",
      order: count,
    },
  });
  await writeAudit({ userId: me.id, action: "CREATE", entity: "AutomationRule", entityId: rule.id, summary: `Created automation "${rule.name}"` });
  revalidatePath("/automations");
  return undefined;
}

export async function updateRule(_prev: RuleState, formData: FormData): Promise<RuleState> {
  const me = await requireManager();
  if (!me) return { error: "Not authorised" };
  const id = String(formData.get("id") ?? "");
  if (!id) return { error: "Missing id" };
  const parsed = schema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "Invalid rule" };
  const d = parsed.data;
  await db.automationRule.update({
    where: { id },
    data: {
      name: d.name,
      description: d.description,
      trigger: d.trigger,
      matchType: d.matchType,
      conditions: normalizeJson(d.conditions),
      actions: normalizeJson(d.actions),
      isActive: d.isActive !== "false",
    },
  });
  await writeAudit({ userId: me.id, action: "UPDATE", entity: "AutomationRule", entityId: id, summary: `Updated automation "${d.name}"` });
  revalidatePath("/automations");
  return undefined;
}

export async function toggleRule(formData: FormData) {
  const me = await requireManager();
  if (!me) return;
  const id = String(formData.get("id") ?? "");
  const rule = await db.automationRule.findUnique({ where: { id } });
  if (!rule) return;
  await db.automationRule.update({ where: { id }, data: { isActive: !rule.isActive } });
  revalidatePath("/automations");
}

export async function deleteRule(formData: FormData) {
  const me = await requireManager();
  if (!me) return;
  const id = String(formData.get("id") ?? "");
  await db.automationRule.delete({ where: { id } }).catch(() => {});
  revalidatePath("/automations");
}
