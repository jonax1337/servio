import { db } from "@/lib/db";

export type ChangeForCab = { id: number; type: string; risk: string; assigneeId: string | null };

/**
 * Compute the CAB (Change Advisory Board) for a change at submit time — a pure
 * query, no membership table. Eligible approvers are active MANAGER/ADMIN users,
 * never the change owner (separation of duties). HIGH-risk changes require ADMIN.
 * NORMAL = the full eligible board; EMERGENCY = an expedited ECAB (≤2, ADMINs first).
 *
 * Future options (not built): a group-scoped CAB via GroupMember, or a
 * Change.pirRequired column instead of the internal-comment PIR marker.
 */
export async function selectApprovers(change: ChangeForCab): Promise<string[]> {
  const roles = change.risk === "HIGH" ? ["ADMIN"] : ["ADMIN", "MANAGER"];
  const candidates = await db.user.findMany({
    where: {
      isActive: true,
      role: { in: roles },
      id: change.assigneeId ? { not: change.assigneeId } : undefined,
    },
    orderBy: { role: "asc" }, // "ADMIN" < "MANAGER" alphabetically → admins first
    select: { id: true },
  });
  const ids = candidates.map((u) => u.id);
  // EMERGENCY: expedited board of at most two (admins prioritised by the order above).
  return change.type === "EMERGENCY" ? ids.slice(0, 2) : ids;
}

/** Whether a user is eligible to be seated as an approver for a change's risk. */
export async function isEligibleApprover(userId: string, risk: string): Promise<boolean> {
  const roles = risk === "HIGH" ? ["ADMIN"] : ["ADMIN", "MANAGER"];
  const u = await db.user.findUnique({ where: { id: userId }, select: { role: true, isActive: true } });
  return !!u && u.isActive && roles.includes(u.role);
}
