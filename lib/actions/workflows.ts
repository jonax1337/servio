"use server";

import { revalidatePath } from "next/cache";
import { db } from "@/lib/db";
import { getSessionUser, hasRole, type Role } from "@/lib/session";
import { writeAudit } from "@/lib/audit";
import { defaultTransitionPairs, isWorkflowEntity } from "@/lib/workflow";

async function requireManager() {
  const me = await getSessionUser();
  return me && hasRole(me.role as Role, "MANAGER") ? me : null;
}

const ROLES_ALLOWED = ["MANAGER", "ADMIN"];

type OverrideInput = {
  fromStatus?: string;
  toStatus?: string;
  allowed?: boolean;
  requiredRole?: string | null;
};

/**
 * Replace the override rows for one entity type's status workflow. The client
 * only sends transitions that DIFFER from the default (disabled or role-gated);
 * everything else falls back to the built-in map. Invalid pairs are dropped.
 */
export async function saveWorkflow(formData: FormData) {
  const me = await requireManager();
  if (!me) return;
  const entityType = String(formData.get("entityType") ?? "");
  if (!isWorkflowEntity(entityType)) return;

  let overrides: OverrideInput[] = [];
  try {
    const parsed = JSON.parse(String(formData.get("overrides") ?? "[]"));
    if (Array.isArray(parsed)) overrides = parsed;
  } catch {
    return;
  }

  const validPairs = new Set(defaultTransitionPairs(entityType).map((p) => `${p.from}>${p.to}`));
  const rows = overrides
    .filter((o): o is Required<Pick<OverrideInput, "fromStatus" | "toStatus">> & OverrideInput =>
      !!o && typeof o.fromStatus === "string" && typeof o.toStatus === "string" &&
      validPairs.has(`${o.fromStatus}>${o.toStatus}`),
    )
    .map((o) => {
      const requiredRole = o.requiredRole && ROLES_ALLOWED.includes(o.requiredRole) ? o.requiredRole : null;
      return { entityType, fromStatus: o.fromStatus, toStatus: o.toStatus, allowed: o.allowed !== false, requiredRole };
    })
    // Keep only genuine overrides (disabled or role-gated); ignore no-op rows.
    .filter((r) => !r.allowed || r.requiredRole !== null);

  await db.$transaction([
    db.statusTransition.deleteMany({ where: { entityType } }),
    ...(rows.length ? [db.statusTransition.createMany({ data: rows })] : []),
  ]);

  await writeAudit({ userId: me.id, action: "UPDATE", entity: "StatusTransition", entityId: entityType, summary: `Updated ${entityType} status workflow` });
  revalidatePath("/settings/workflows");
}

/** Drop all overrides for an entity type — back to the built-in default map. */
export async function resetWorkflow(formData: FormData) {
  const me = await requireManager();
  if (!me) return;
  const entityType = String(formData.get("entityType") ?? "");
  if (!isWorkflowEntity(entityType)) return;

  await db.statusTransition.deleteMany({ where: { entityType } });
  await writeAudit({ userId: me.id, action: "UPDATE", entity: "StatusTransition", entityId: entityType, summary: `Reset ${entityType} status workflow to defaults` });
  revalidatePath("/settings/workflows");
}
