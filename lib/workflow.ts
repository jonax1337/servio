import { db } from "@/lib/db";
import { hasRole, type Role } from "@/lib/session";
import {
  canTransition,
  TICKET_TRANSITIONS,
  PROBLEM_TRANSITIONS,
  CHANGE_TRANSITIONS,
  type TransitionMap,
} from "@/lib/transitions";

/** Entity types whose status lifecycle is configurable in /settings/workflows. */
export const WORKFLOW_ENTITY_TYPES = ["TICKET", "PROBLEM", "CHANGE"] as const;
export type WorkflowEntityType = (typeof WORKFLOW_ENTITY_TYPES)[number];

const MAPS: Record<WorkflowEntityType, TransitionMap> = {
  TICKET: TICKET_TRANSITIONS,
  PROBLEM: PROBLEM_TRANSITIONS,
  CHANGE: CHANGE_TRANSITIONS,
};

// Tickets/Problems fail OPEN on an unknown `from` (never freeze a record after a
// status rename); the governed Change lifecycle fails closed.
const FAIL_CLOSED: Record<WorkflowEntityType, boolean> = {
  TICKET: false,
  PROBLEM: false,
  CHANGE: true,
};

export function isWorkflowEntity(v: string): v is WorkflowEntityType {
  return (WORKFLOW_ENTITY_TYPES as readonly string[]).includes(v);
}

export function defaultMap(entityType: WorkflowEntityType): TransitionMap {
  return MAPS[entityType];
}

/** Flatten a default map into ordered {from,to} pairs — the editable surface. */
export function defaultTransitionPairs(entityType: WorkflowEntityType): { from: string; to: string }[] {
  const map = MAPS[entityType];
  const pairs: { from: string; to: string }[] = [];
  for (const from of Object.keys(map)) for (const to of map[from]) pairs.push({ from, to });
  return pairs;
}

export type TransitionOverride = {
  fromStatus: string;
  toStatus: string;
  allowed: boolean;
  requiredRole: string | null;
};

/**
 * The set of statuses reachable from `from` for a given role, under the current
 * config. Includes `from` itself (staying put is always fine). Used to grey out
 * forbidden options in the status dropdowns. One query, not one-per-candidate.
 */
export async function allowedTransitions(
  entityType: WorkflowEntityType,
  from: string,
  role: Role,
): Promise<Set<string>> {
  const targets = MAPS[entityType][from] ?? [];
  const overrides = await getOverrides(entityType);
  const byPair = new Map(overrides.map((o) => [`${o.fromStatus}>${o.toStatus}`, o]));
  const out = new Set<string>([from]);
  for (const to of targets) {
    const o = byPair.get(`${from}>${to}`);
    if (o) {
      if (!o.allowed) continue;
      if (o.requiredRole && !hasRole(role, o.requiredRole as Role)) continue;
    }
    out.add(to);
  }
  return out;
}

export async function getOverrides(entityType: WorkflowEntityType): Promise<TransitionOverride[]> {
  const rows = await db.statusTransition.findMany({
    where: { entityType },
    select: { fromStatus: true, toStatus: true, allowed: true, requiredRole: true },
  });
  return rows;
}

/**
 * Role-aware transition check layering admin overrides on the built-in map:
 *   1. must be structurally allowed by the lifecycle map (fail-open per entity)
 *   2. an override row may disable it (`allowed=false`) or require a role
 * A no-op (from===to) or empty `from` always passes.
 */
export async function canTransitionConfigured(
  entityType: WorkflowEntityType,
  from: string | null | undefined,
  to: string,
  role: Role,
): Promise<boolean> {
  if (!from || from === to) return true;
  if (!canTransition(MAPS[entityType], from, to, FAIL_CLOSED[entityType])) return false;

  const ovr = await db.statusTransition.findUnique({
    where: {
      entityType_fromStatus_toStatus: { entityType, fromStatus: from, toStatus: to },
    },
    select: { allowed: true, requiredRole: true },
  });
  if (!ovr) return true;
  if (!ovr.allowed) return false;
  if (ovr.requiredRole && !hasRole(role, ovr.requiredRole as Role)) return false;
  return true;
}
