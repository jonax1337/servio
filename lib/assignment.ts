import { db } from "@/lib/db";
import { notify } from "@/lib/audit";
import { isAgent, type Role } from "@/lib/session";
import { OPEN_TICKET_STATUSES } from "@/lib/constants";

/** True when `userId` is a member of `groupId`. Used to keep assignees within
 *  the group a ticket/problem/change is routed to. */
export async function isGroupMember(groupId: string, userId: string): Promise<boolean> {
  const m = await db.groupMember.findUnique({
    where: { groupId_userId: { groupId, userId } },
    select: { userId: true },
  });
  return !!m;
}

/**
 * Auto-assign a ticket to an agent in its group according to the group's
 * strategy. No-op when the ticket already has an assignee, has no group, the
 * group's strategy is OFF, or there are no eligible active agents in the group.
 * Returns the chosen userId, or null when nothing was assigned.
 */
export async function autoAssignTicket(ticketId: number): Promise<string | null> {
  const ticket = await db.ticket.findUnique({
    where: { id: ticketId },
    select: { id: true, title: true, assigneeId: true, groupId: true },
  });
  if (!ticket || ticket.assigneeId || !ticket.groupId) return null;

  const group = await db.group.findUnique({
    where: { id: ticket.groupId },
    select: {
      autoAssign: true,
      lastAssignedUserId: true,
      members: {
        include: { user: { select: { id: true, role: true, isActive: true } } },
      },
    },
  });
  if (!group || group.autoAssign === "OFF") return null;

  // Eligible = active agents (AGENT or above) that belong to the group,
  // ordered deterministically so round-robin is stable.
  const eligible = group.members
    .map((m) => m.user)
    .filter((u) => u.isActive && isAgent(u.role as Role))
    .sort((a, b) => a.id.localeCompare(b.id));
  if (eligible.length === 0) return null;

  let pickId: string;
  if (group.autoAssign === "LEAST_BUSY") {
    const counts = await Promise.all(
      eligible.map((u) =>
        db.ticket.count({ where: { assigneeId: u.id, status: { in: [...OPEN_TICKET_STATUSES] } } }),
      ),
    );
    let best = 0;
    for (let i = 1; i < eligible.length; i++) if (counts[i] < counts[best]) best = i;
    pickId = eligible[best].id;
  } else {
    // ROUND_ROBIN — next agent after the last one assigned (wraps around).
    const lastIdx = eligible.findIndex((u) => u.id === group.lastAssignedUserId);
    pickId = eligible[(lastIdx + 1) % eligible.length].id;
  }

  // Conditional write so two concurrent triggers can't both assign / double-notify:
  // only the writer that finds assigneeId still null wins.
  const res = await db.ticket.updateMany({
    where: { id: ticket.id, assigneeId: null },
    data: { assigneeId: pickId },
  });
  if (res.count === 0) return null;

  // Cursor advance is a separate write (not transactional): under heavy concurrent
  // assignment the round-robin distribution can skew slightly — acceptable for ITSM,
  // not a correctness guarantee.
  await db.group.update({ where: { id: ticket.groupId }, data: { lastAssignedUserId: pickId } });
  await notify(pickId, {
    type: "ASSIGNED",
    title: "Ticket assigned to you",
    body: ticket.title,
    entity: "Ticket",
    entityId: String(ticket.id),
  });
  return pickId;
}
