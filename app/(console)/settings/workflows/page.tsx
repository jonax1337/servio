import type { Metadata } from "next";
import { Workflow } from "lucide-react";
import { requireRole } from "@/lib/session";
import { PageHeader, PageBody } from "@/components/page-header";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { WorkflowEditor } from "@/components/settings/workflow-editor";
import {
  WORKFLOW_ENTITY_TYPES, defaultTransitionPairs, getOverrides, type WorkflowEntityType,
} from "@/lib/workflow";
import {
  TICKET_STATUS_META, PROBLEM_STATUS_META, CHANGE_STATUS_META, type Meta, type Tone,
} from "@/lib/constants";

export const metadata: Metadata = { title: "Status workflows" };
export const dynamic = "force-dynamic";

const ENTITY_LABEL: Record<WorkflowEntityType, string> = {
  TICKET: "Tickets",
  PROBLEM: "Problems",
  CHANGE: "Changes",
};

/** Strip meta to the serializable {label, tone} the client editor needs (no icons). */
function stripMeta(m: Record<string, Meta>): Record<string, { label: string; tone: Tone }> {
  const out: Record<string, { label: string; tone: Tone }> = {};
  for (const [k, v] of Object.entries(m)) out[k] = { label: v.label, tone: v.tone };
  return out;
}

const META: Record<WorkflowEntityType, Record<string, { label: string; tone: Tone }>> = {
  TICKET: stripMeta(TICKET_STATUS_META),
  PROBLEM: stripMeta(PROBLEM_STATUS_META),
  CHANGE: stripMeta(CHANGE_STATUS_META),
};

export default async function WorkflowsSettingsPage() {
  await requireRole("MANAGER");

  const data = await Promise.all(
    WORKFLOW_ENTITY_TYPES.map(async (entityType) => ({
      entityType,
      pairs: defaultTransitionPairs(entityType),
      overrides: await getOverrides(entityType),
    })),
  );

  return (
    <>
      <PageHeader
        icon={Workflow}
        title="Status workflows"
        description="Control which status changes are allowed, and gate specific transitions behind a role. Turn a transition off to forbid it entirely."
      />
      <PageBody className="grid gap-6">
        {data.map(({ entityType, pairs, overrides }) => (
          <Card key={entityType}>
            <CardHeader>
              <CardTitle className="text-sm">{ENTITY_LABEL[entityType]}</CardTitle>
            </CardHeader>
            <CardContent>
              <WorkflowEditor
                // Remount when the persisted overrides change (after save/reset)
                // so the editor reseeds from server state instead of stale local state.
                key={JSON.stringify(overrides)}
                entityType={entityType}
                pairs={pairs}
                statusMeta={META[entityType]}
                overrides={overrides}
              />
            </CardContent>
          </Card>
        ))}
      </PageBody>
    </>
  );
}
