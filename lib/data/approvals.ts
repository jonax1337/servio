import { db } from "@/lib/db";
import type { ApprovalEntityType } from "@/lib/constants";
import type { EntityApprovalRow } from "@/components/approvals/entity-approvals";

/** Load the generic ad-hoc approvals for one entity, shaped for EntityApprovals. */
export async function getEntityApprovals(
  entityType: ApprovalEntityType,
  entityId: string | number,
): Promise<EntityApprovalRow[]> {
  const rows = await db.approval.findMany({
    where: { entityType, entityId: String(entityId) },
    include: { approver: { select: { id: true, name: true, email: true } } },
    orderBy: { createdAt: "asc" },
  });
  return rows.map((a) => ({
    id: a.id,
    title: a.title,
    status: a.status,
    comment: a.comment,
    decidedAt: a.decidedAt,
    requestedById: a.requestedById,
    approver: a.approver,
  }));
}
