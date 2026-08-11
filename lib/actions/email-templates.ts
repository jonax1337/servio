"use server";

import { revalidatePath } from "next/cache";
import { db } from "@/lib/db";
import { getCurrentUser, hasRole, type Role } from "@/lib/session";
import { writeAudit } from "@/lib/audit";
import { TEMPLATE_KEYS, type TemplateKey } from "@/lib/email-templates";

export type ActionState = { error?: string; ok?: boolean } | undefined;

async function requireAdmin() {
  const me = await getCurrentUser();
  if (!me || !me.isActive || !hasRole(me.role as Role, "ADMIN")) return null;
  return me;
}

function isKey(k: string): k is TemplateKey {
  return (TEMPLATE_KEYS as readonly string[]).includes(k);
}

/** Upsert one editable email template (subject + HTML body + enabled). */
export async function saveEmailTemplate(_prev: ActionState, fd: FormData): Promise<ActionState> {
  const me = await requireAdmin();
  if (!me) return { error: "Not authorised" };
  const key = String(fd.get("key") ?? "");
  if (!isKey(key)) return { error: "Unknown template." };
  const subject = String(fd.get("subject") ?? "").trim();
  const bodyHtml = String(fd.get("bodyHtml") ?? "").trim();
  const enabled = fd.get("enabled") === "on";
  if (!subject || !bodyHtml) return { error: "Subject and body are required." };

  await db.emailTemplate.upsert({
    where: { key },
    create: { key, subject, bodyHtml, enabled, updatedById: me.id },
    update: { subject, bodyHtml, enabled, updatedById: me.id },
  });
  await writeAudit({ userId: me.id, action: "UPDATE", entity: "EmailTemplate", entityId: key, summary: `Edited email template ${key}` });
  revalidatePath("/settings/email-templates");
  return { ok: true };
}

/** Drop the override so the template falls back to the built-in default. */
export async function resetEmailTemplate(fd: FormData): Promise<void> {
  const me = await requireAdmin();
  if (!me) return;
  const key = String(fd.get("key") ?? "");
  if (!isKey(key)) return;
  await db.emailTemplate.deleteMany({ where: { key } });
  await writeAudit({ userId: me.id, action: "UPDATE", entity: "EmailTemplate", entityId: key, summary: `Reset email template ${key} to default` });
  revalidatePath("/settings/email-templates");
}
