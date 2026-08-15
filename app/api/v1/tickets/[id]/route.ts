import { z } from "zod";
import { db } from "@/lib/db";
import { guard, ok, apiError, preflight, principalIsAgent, validateTicketAssignee } from "@/lib/api";
import { writeAudit } from "@/lib/audit";
import { pauseData, resumeData } from "@/lib/sla";
import { canTransition, TICKET_TRANSITIONS } from "@/lib/transitions";
import { serializeTicket } from "../../_serializers";
import { TICKET_STATUSES, PRIORITIES } from "@/lib/constants";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export function OPTIONS() {
  return preflight();
}

export async function GET(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const auth = await guard(req, "read");
  if ("response" in auth) return auth.response;
  const { id } = await ctx.params;
  const ticketId = Number(id);
  if (!Number.isInteger(ticketId)) return apiError(404, "Ticket not found");

  const ticket = await db.ticket.findUnique({
    where: { id: ticketId },
    include: { requester: true, assignee: true },
  });
  if (!ticket) return apiError(404, "Ticket not found");
  // Non-agents may only read their own tickets (404, not 403, to avoid leaking existence).
  if (!principalIsAgent(auth.principal) && ticket.requesterId !== auth.principal.userId)
    return apiError(404, "Ticket not found");
  return ok(serializeTicket(ticket));
}

const patchSchema = z.object({
  title: z.string().min(3).optional(),
  description: z.string().optional(),
  status: z.enum(TICKET_STATUSES).optional(),
  priority: z.enum(PRIORITIES).optional(),
  assigneeId: z.string().nullable().optional(),
});

export async function PATCH(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const auth = await guard(req, "write");
  if ("response" in auth) return auth.response;
  const { id } = await ctx.params;
  const ticketId = Number(id);
  if (!Number.isInteger(ticketId)) return apiError(404, "Ticket not found");

  const existing = await db.ticket.findUnique({ where: { id: ticketId } });
  if (!existing) return apiError(404, "Ticket not found");
  // Non-agents cannot mutate tickets via the API (they may only read their own).
  if (!principalIsAgent(auth.principal)) return apiError(404, "Ticket not found");

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return apiError(400, "Invalid JSON body");
  }
  const parsed = patchSchema.safeParse(body);
  if (!parsed.success) return apiError(422, "Validation failed", parsed.error.flatten().fieldErrors);

  // Validate a (re)assignment up front so a bad assigneeId is a 422, not a 500
  // on the FK, and so we never assign a non-agent or an out-of-group user.
  if (parsed.data.assigneeId) {
    const reason = await validateTicketAssignee(parsed.data.assigneeId, existing.groupId);
    if (reason) return apiError(422, "Validation failed", { assigneeId: [reason] });
  }

  const data = { ...parsed.data } as Record<string, unknown>;
  const to = parsed.data.status;
  if (to && to !== existing.status) {
    // Mirror the server-action lifecycle: guard the transition and run the SLA clock.
    if (!canTransition(TICKET_TRANSITIONS, existing.status, to)) {
      return apiError(409, `Illegal status transition ${existing.status} → ${to}`);
    }
    const now = new Date();
    const wasPending = existing.status === "PENDING" || existing.status === "ON_HOLD";
    const willPending = to === "PENDING" || to === "ON_HOLD";
    if (willPending && !wasPending) Object.assign(data, pauseData(existing, now));
    let effResolveDueAt = existing.resolveDueAt;
    if (!willPending && wasPending) {
      const resumed = resumeData(existing, now);
      Object.assign(data, resumed);
      effResolveDueAt = resumed.resolveDueAt ?? existing.resolveDueAt;
    }
    if (to === "RESOLVED") {
      data.resolvedAt = now;
      data.resolveBreached = effResolveDueAt ? now > effResolveDueAt : false;
    }
    if (to === "CLOSED") data.closedAt = now;
    if (!willPending) { data.pendingReason = null; data.pendingNote = null; }
  }

  const ticket = await db.ticket.update({
    where: { id: ticketId },
    data,
    include: { requester: true, assignee: true },
  });
  await writeAudit({ userId: auth.principal.userId, action: "UPDATE", entity: "Ticket", entityId: ticket.id, summary: "Updated via API" });

  return ok(serializeTicket(ticket));
}
