"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { nanoid } from "nanoid";
import bcrypt from "bcryptjs";
import { db } from "@/lib/db";
import { getCurrentUser, hasRole, type Role } from "@/lib/session";
import { writeAudit } from "@/lib/audit";

const SCOPE_VALUES = ["read", "read,write", "read,write,admin"] as const;

const createSchema = z.object({
  name: z.string().min(1, "Name is required").max(60),
  scopes: z.enum(SCOPE_VALUES).default("read"),
});

export type ActionState =
  | { error?: string; fieldErrors?: Record<string, string[]>; token?: string }
  | undefined;

export async function createApiToken(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  // DB-truth: a demoted/deactivated user with a live JWT must not mint tokens,
  // and API tokens (up to admin scope) are an ADMIN-only capability.
  const me = await getCurrentUser();
  if (!me || !me.isActive || !hasRole(me.role as Role, "ADMIN")) return { error: "Not authorised" };

  const parsed = createSchema.safeParse({
    name: formData.get("name"),
    scopes: formData.get("scopes") ?? "read",
  });
  if (!parsed.success) {
    return {
      error: "Please fix the errors below.",
      fieldErrors: parsed.error.flatten().fieldErrors,
    };
  }

  const raw = "servio_pat_" + nanoid(32);
  const prefix = raw.slice(0, 18);
  const tokenHash = await bcrypt.hash(raw, 10);

  const token = await db.apiToken.create({
    data: {
      name: parsed.data.name.trim(),
      prefix,
      tokenHash,
      scopes: parsed.data.scopes,
      userId: me.id,
    },
  });

  await writeAudit({
    userId: me.id,
    action: "CREATE",
    entity: "ApiToken",
    entityId: token.id,
    summary: `Created API token "${token.name}"`,
  });

  revalidatePath("/settings/api");
  return { token: raw };
}

export async function revokeApiToken(formData: FormData) {
  // DB-truth role, not the stale JWT: a demoted ex-admin must not keep the
  // admin-wide revoke power, and a deactivated user must not revoke at all.
  // Minting/revoking API tokens is an ADMIN-only capability.
  const me = await getCurrentUser();
  if (!me || !me.isActive || !hasRole(me.role as Role, "ADMIN")) return;
  const id = String(formData.get("id") ?? "");
  if (!id) return;

  const token = await db.apiToken.findFirst({ where: { id } });
  if (!token) return;

  await db.apiToken.update({
    where: { id: token.id },
    data: { revoked: true },
  });

  await writeAudit({
    userId: me.id,
    action: "UPDATE",
    entity: "ApiToken",
    entityId: id,
    summary: `Revoked API token "${token.name}"`,
  });

  revalidatePath("/settings/api");
}
