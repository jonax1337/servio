import type { z } from "zod";
import type { Role } from "@/lib/session";

/** The chat surface an operation is offered on. ADMIN-only ops need ADMIN scope. */
export type AiOpChatScope = "GENERAL" | "ADMIN";

/**
 * The acting user, resolved fresh from the DB by the caller (never model-supplied).
 * `projectId` is the Sable Project the chat is bound to, when any — set only by the
 * caller (from context, never the model) so project ops target the right library.
 */
export type AiOpCtx = { userId: string; role: Role; name: string; projectId?: string };

/** Result of running an operation. `summary` is shown to the user on success. */
export type AiOpResult =
  | { ok: true; summary: string; data?: unknown }
  | { ok: false; error: string };

/**
 * One RBAC-gated operation that Sable can perform. WRITE ops are surfaced as
 * `propose_*` tools → the user approves an approval card → applyAssistantProposal
 * re-validates (role, scope, args) and calls `run`, which does the real mutation
 * (reusing existing actions where non-redirecting, else a guarded Prisma write +
 * writeAudit). READ ops execute immediately in the tool.
 *
 * Authority is the app's real RBAC: `minRole` mirrors the underlying action, so
 * Sable can do exactly what the acting user could do in the UI — no more. `adminOnly`
 * now requires the ADMIN role (no separate chat scope), so system-wide config ops
 * surface in the normal chat for admins only.
 */
export type AiOperation = {
  /** Stable dot id, e.g. "category.create". Tool name = id with dots→underscores. */
  id: string;
  /** Display grouping, e.g. "Categories". */
  group: string;
  kind: "read" | "write";
  /** Minimum role, mirroring the underlying action's own RBAC check. */
  minRole: Role;
  /** When true, requires the ADMIN role (no separate chat scope). */
  adminOnly?: boolean;
  /** Tool description shown to the model. */
  description: string;
  /** Zod object schema for the tool input / apply-time re-validation. */
  input: z.ZodObject<z.ZodRawShape>;
  /** Human approval-card label (write ops). */
  label?: (args: Record<string, unknown>) => string;
  /** Do the work. Called from the tool (read) or applyAssistantProposal (write). */
  run: (args: Record<string, unknown>, ctx: AiOpCtx) => Promise<AiOpResult>;
};
