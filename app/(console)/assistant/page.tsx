import { requireRole, hasRole, type Role } from "@/lib/session";
import { listConversations } from "@/lib/actions/ai-assistant";
import { AssistantShell } from "@/components/assistant/assistant-shell";

export const metadata = { title: "Vio" };

export default async function AssistantPage() {
  // Console layout already gates AGENT; re-assert here (redirects non-agents)
  // and derive whether the Admin scope may be offered. RBAC is enforced again
  // server-side in the actions — this only decides what the UI exposes.
  const user = await requireRole("AGENT");
  const isAdmin = hasRole(user.role as Role, "ADMIN");

  const initialConversations = await listConversations();

  return (
    <AssistantShell
      isAdmin={isAdmin}
      initialConversations={initialConversations}
    />
  );
}
