import type { z } from "zod";
import type { Role } from "@/lib/session";

/** The chat surface an operation is offered on. ADMIN-only ops need ADMIN scope. */
export type AiOpChatScope = "GENERAL" | "ADMIN";

/** The acting user, resolved fresh from the DB by the caller (never model-supplied). */
export type AiOpCtx = { userId: string; role: Role; name: string };

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
 * additionally hides an op unless the chat is in ADMIN scope (the Admin tab), so
 * system-wide config lives there.
 */
export type AiOperation = {
  /** Stable dot id, e.g. "category.create". Tool name = id with dots→underscores. */
  id: string;
  /** Display grouping, e.g. "Categories". */
  group: string;
  kind: "read" | "write";
  /** Minimum role, mirroring the underlying action's own RBAC check. */
  minRole: Role;
  /** When true, only offered in ADMIN chat scope (system-wide config). */
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
