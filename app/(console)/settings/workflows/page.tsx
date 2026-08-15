import type { Metadata } from "next";
import { Workflow } from "lucide-react";
import { requireRole } from "@/lib/session";
import { PageHeader, PageBody } from "@/components/page-header";
import { Card, CardAction, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { WorkflowList } from "@/components/settings/workflow-list";
import { WorkflowGraph } from "@/components/settings/workflow-graph";
import {
  WORKFLOW_ENTITY_TYPES, getEffectiveTransitions, type WorkflowEntityType,
} from "@/lib/workflow";
import {
  TICKET_STATUSES, PROBLEM_STATUSES, CHANGE_STATUSES,
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

const STATUS_ORDER: Record<WorkflowEntityType, readonly string[]> = {
  TICKET: TICKET_STATUSES,
  PROBLEM: PROBLEM_STATUSES,
  CHANGE: CHANGE_STATUSES,
};

function statusList(entityType: WorkflowEntityType) {
  const meta = META[entityType];
  return STATUS_ORDER[entityType].map((value) => ({
    value,
    label: meta[value]?.label ?? value,
    tone: meta[value]?.tone ?? ("neutral" as Tone),
  }));
}

export default async function WorkflowsSettingsPage() {
  await requireRole("MANAGER");

  const data = await Promise.all(
    WORKFLOW_ENTITY_TYPES.map(async (entityType) => ({
      entityType,
      statuses: statusList(entityType),
      transitions: await getEffectiveTransitions(entityType),
    })),
  );

  return (
    <>
      <PageHeader
        icon={Workflow}
        title="Status workflows"
        description="Define which status changes are allowed for each entity — add or remove transitions freehand and gate any of them behind a role. Empty falls back to sensible defaults."
      />
      <PageBody className="grid gap-6">
        {data.map(({ entityType, statuses, transitions }) => (
          <Card key={entityType}>
            <CardHeader>
              <CardTitle className="text-sm">{ENTITY_LABEL[entityType]}</CardTitle>
              <CardAction>
                <WorkflowGraph
                  entityType={entityType}
                  entityLabel={ENTITY_LABEL[entityType]}
                  statuses={statuses}
                  transitions={transitions}
                />
              </CardAction>
            </CardHeader>
            <CardContent>
              <WorkflowList
                // Remount when persisted transitions change (after save/reset) so
                // the editor reseeds from server state instead of stale local state.
                key={JSON.stringify(transitions)}
                entityType={entityType}
                statuses={statuses}
                transitions={transitions}
              />
            </CardContent>
          </Card>
        ))}
      </PageBody>
    </>
  );
}
