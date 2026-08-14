// Access control for Sable Projects — a pure helper (NOT "use server"), safe to
// import from server actions and route handlers. A project is owned by one user
// and may be SHARED with one team (Group); shared projects are readable and
// contributable (files + own chats) by that team's members. Reconfiguring or
// deleting the project stays owner-only.
import { db } from "@/lib/db";
import type { Role } from "@/lib/session";

export type ProjectActor = { id: string; role: Role };

/** The subset of AiProject columns access decisions depend on. */
export type ProjectAccessRow = {
  userId: string;
  isShared: boolean;
  groupId: string | null;
};

/** Is the actor a member of the given group? */
async function isGroupMember(userId: string, groupId: string): Promise<boolean> {
  const m = await db.groupMember.findFirst({
    where: { userId, groupId },
    select: { userId: true },
  });
  return !!m;
}

/**
 * May the actor VIEW / CONTRIBUTE to this project (browse + upload files, run
 * their own chats)? True for the owner, or a member of the shared team.
 */
export async function canAccessProjectRow(actor: ProjectActor, p: ProjectAccessRow): Promise<boolean> {
  if (p.userId === actor.id) return true;
  if (p.isShared && p.groupId) return isGroupMember(actor.id, p.groupId);
  return false;
}

/** May the actor RECONFIGURE / DELETE the project (rename, instructions, binding, sharing)? Owner only. */
export function canManageProjectRow(actor: ProjectActor, p: ProjectAccessRow): boolean {
  return p.userId === actor.id;
}

/** Fetch + view-access check by id. Returns null on missing OR denied (no oracle). */
export async function loadAccessibleProject(
  actor: ProjectActor,
  projectId: string,
): Promise<ProjectAccessRow | null> {
  const p = await db.aiProject.findUnique({
    where: { id: projectId },
    select: { userId: true, isShared: true, groupId: true },
  });
  if (!p) return null;
  return (await canAccessProjectRow(actor, p)) ? p : null;
}
