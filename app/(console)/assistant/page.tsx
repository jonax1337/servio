import { requireRole, hasRole, type Role } from "@/lib/session";
import { aiConfigured, aiTeaserEnabled } from "@/lib/ai";
import { AI_ASSISTANT_NAME } from "@/lib/constants";
import { VioWindow } from "@/components/assistant/vio-window";

export const metadata = { title: AI_ASSISTANT_NAME };

/**
 * The standalone Vio route. Renders the ONE global Vio window inline (docked,
 * full-page, no overlay) so the sidebar item stays deep-linkable while sharing
 * the same <VioProvider> state as the floating window everywhere else.
 */
export default async function AssistantPage() {
  const user = await requireRole("AGENT");
  const isAdmin = hasRole(user.role as Role, "ADMIN");
  const [configured, teaser] = await Promise.all([aiConfigured(), aiTeaserEnabled()]);

  return (
    <div className="h-full p-3">
      <VioWindow variant="inline" isAdmin={isAdmin} disabled={!configured} teaser={teaser && !configured} />
    </div>
  );
}
