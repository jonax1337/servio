import { db } from "@/lib/db";
import { hasRole, type Role } from "@/lib/session";
import {
  TICKET_TRANSITIONS,
  PROBLEM_TRANSITIONS,
  CHANGE_TRANSITIONS,
  type TransitionMap,
} from "@/lib/transitions";
import { TICKET_STATUSES, PROBLEM_STATUSES, CHANGE_STATUSES } from "@/lib/constants";

/** Entity types whose status lifecycle is configurable in /settings/workflows. */
export const WORKFLOW_ENTITY_TYPES = ["TICKET", "PROBLEM", "CHANGE"] as const;
export type WorkflowEntityType = (typeof WORKFLOW_ENTITY_TYPES)[number];

// The built-in lifecycle is the *starting template*. Admin config layers on top
// as deltas: a StatusTransition row can REMOVE a built-in transition
// (allowed=false), ADD one that isn't built-in (allowed=true), or gate any
// allowed transition behind a role (requiredRole). No rows ⇒ pure defaults.
const MAPS: Record<WorkflowEntityType, TransitionMap> = {
  TICKET: TICKET_TRANSITIONS,
  PROBLEM: PROBLEM_TRANSITIONS,
  CHANGE: CHANGE_TRANSITIONS,
};

const ENTITY_STATUSES: Record<WorkflowEntityType, readonly string[]> = {
  TICKET: TICKET_STATUSES,
  PROBLEM: PROBLEM_STATUSES,
  CHANGE: CHANGE_STATUSES,
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

export function entityStatuses(entityType: WorkflowEntityType): readonly string[] {
  return ENTITY_STATUSES[entityType];
}

function isBuiltin(entityType: WorkflowEntityType, from: string, to: string): boolean {
  return MAPS[entityType][from]?.includes(to) ?? false;
}

export type TransitionOverride = {
  fromStatus: string;
  toStatus: string;
  allowed: boolean;
  requiredRole: string | null;
};

export async function getOverrides(entityType: WorkflowEntityType): Promise<TransitionOverride[]> {
  const rows = await db.statusTransition.findMany({
    where: { entityType },
    select: { fromStatus: true, toStatus: true, allowed: true, requiredRole: true },
  });
  return rows;
}

export type EffectiveTransition = { from: string; to: string; requiredRole: string | null };

/**
 * The complete set of currently-allowed transitions (built-in minus removed,
 * plus added), each with its role gate. This is what the visual builder and the
 * matrix editor render and edit — the full lifecycle, not a diff.
 */
export async function getEffectiveTransitions(entityType: WorkflowEntityType): Promise<EffectiveTransition[]> {
  const overrides = await getOverrides(entityType);
  const byPair = new Map(overrides.map((o) => [`${o.fromStatus}>${o.toStatus}`, o]));
  const result: EffectiveTransition[] = [];
  const seen = new Set<string>();

  for (const from of Object.keys(MAPS[entityType])) {
    for (const to of MAPS[entityType][from]) {
      const k = `${from}>${to}`;
      const o = byPair.get(k);
      if (o && !o.allowed) continue; // removed
      result.push({ from, to, requiredRole: o?.requiredRole ?? null });
      seen.add(k);
    }
  }
  // Admin-added transitions that aren't part of the built-in lifecycle.
  for (const o of overrides) {
    if (!o.allowed) continue;
    const k = `${o.fromStatus}>${o.toStatus}`;
    if (seen.has(k) || isBuiltin(entityType, o.fromStatus, o.toStatus)) continue;
    result.push({ from: o.fromStatus, to: o.toStatus, requiredRole: o.requiredRole ?? null });
  }
  return result;
}

/**
 * The statuses reachable from `from` for a role under the current config
 * (including `from` itself). Drives the greyed-out status dropdowns.
 */
export async function allowedTransitions(
  entityType: WorkflowEntityType,
  from: string,
  role: Role,
): Promise<Set<string>> {
  const overrides = await getOverrides(entityType);
  const byPair = new Map(overrides.map((o) => [`${o.fromStatus}>${o.toStatus}`, o]));
  const builtinTargets = MAPS[entityType][from] ?? [];
  const added = overrides.filter((o) => o.fromStatus === from && o.allowed).map((o) => o.toStatus);
  const candidates = new Set<string>([...builtinTargets, ...added]);

  const out = new Set<string>([from]);
  for (const to of candidates) {
    const o = byPair.get(`${from}>${to}`);
    const ok = o ? o.allowed : builtinTargets.includes(to);
    if (!ok) continue;
    if (o?.requiredRole && !hasRole(role, o.requiredRole as Role)) continue;
    out.add(to);
  }
  return out;
}

/**
 * Role-aware transition check. A transition is allowed when the config says so
 * (an added/kept row) or, absent a row, the built-in lifecycle allows it; then
 * the row's role gate (if any) must be satisfied. A no-op always passes.
 */
export async function canTransitionConfigured(
  entityType: WorkflowEntityType,
  from: string | null | undefined,
  to: string,
  role: Role,
): Promise<boolean> {
  if (!from || from === to) return true;
  const targets = MAPS[entityType][from];
  const baseAllowed = targets ? targets.includes(to) : !FAIL_CLOSED[entityType];

  const ovr = await db.statusTransition.findUnique({
    where: { entityType_fromStatus_toStatus: { entityType, fromStatus: from, toStatus: to } },
    select: { allowed: true, requiredRole: true },
  });
  const ok = ovr ? ovr.allowed : baseAllowed;
  if (!ok) return false;
  if (ovr?.requiredRole && !hasRole(role, ovr.requiredRole as Role)) return false;
  return true;
}
