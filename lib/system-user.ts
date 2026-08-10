import { db } from "@/lib/db";

/** Email of the pseudo "Automation" account that authors automation-written content. */
export const AUTOMATION_EMAIL = "automation@servio.system";

/**
 * Get (or lazily create) the pseudo "Automation" user. It's an inactive account
 * with no password — it can't log in and never appears in agent/assignee lists —
 * but it authors comments/notes written by automation rules so they're clearly
 * attributed to the system rather than a random admin.
 */
export async function getAutomationUserId(): Promise<string> {
  const user = await db.user.upsert({
    where: { email: AUTOMATION_EMAIL },
    update: {},
    create: { email: AUTOMATION_EMAIL, name: "Automation", role: "AGENT", isActive: false },
    select: { id: true },
  });
  return user.id;
}
