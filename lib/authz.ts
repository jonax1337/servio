import { isGroupMember } from "@/lib/assignment";
import { hasRole, type Role } from "@/lib/session";

/** The minimal user shape an authorization check needs. */
type ActingUser = { id: string; role: Role | string };
/** The minimal ticket shape an authorization check needs. */
type ActingTicket = { assigneeId?: string | null; groupId?: string | null };

/**
 * Whether `user` may act on `ticket` (comment, forward, merge, resolve, delete, …).
 *
 * - ADMIN / MANAGER may act on ANY ticket.
 * - AGENT may act only on tickets they are assigned to OR whose group they belong
 *   to (GroupMember). An unassigned, un-grouped ticket is actionable by any agent.
 *
 * Pure helper: pass already-loaded user + ticket (or their ids). The group-member
 * lookup is the only DB read, and only for agents on a grouped ticket they don't own.
 */
export async function canActOnTicket(user: ActingUser, ticket: ActingTicket): Promise<boolean> {
  if (hasRole(user.role as Role, "MANAGER")) return true;
  // Below MANAGER: only AGENT-level users get here through the requireAgent gate,
  // but guard anyway so a USER can never act even if this is called elsewhere.
  if (!hasRole(user.role as Role, "AGENT")) return false;
  if (ticket.assigneeId && ticket.assigneeId === user.id) return true;
  if (ticket.groupId) return isGroupMember(ticket.groupId, user.id);
  // No group and not the assignee → shared queue, any agent may act.
  return true;
}

/**
 * Assertion form of {@link canActOnTicket}. Returns `true` when allowed, `false`
 * when not — callers `return`/short-circuit on a `false`, matching the silent-abort
 * style of the ticket actions (which return void on an unauthorized request).
 */
export async function assertCanActOnTicket(user: ActingUser, ticket: ActingTicket): Promise<boolean> {
  return canActOnTicket(user, ticket);
}
