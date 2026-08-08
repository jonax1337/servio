import { z } from "zod";
import { db } from "@/lib/db";
import { guard, ok, apiError, preflight } from "@/lib/api";
import { writeAudit } from "@/lib/audit";
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

  const ticket = await db.ticket.findUnique({
    where: { id: Number(id) },
    include: { requester: true, assignee: true },
  });
  if (!ticket) return apiError(404, "Ticket not found");
  return ok(serializeTicket(ticket));
}

const patchSchema = z.object({
  title: z.string().min(3).optional(),
  description: z.string().optional(),
  status: z.enum(TICKET_STATUSES).optional(),
  priority: z.enum(PRIORITIES).optional(),
  assigneeId: z.string().nullable().optional(),
  queueId: z.string().nullable().optional(),
});

export async function PATCH(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const auth = await guard(req, "write");
  if ("response" in auth) return auth.response;
  const { id } = await ctx.params;

  const existing = await db.ticket.findUnique({ where: { id: Number(id) } });
  if (!existing) return apiError(404, "Ticket not found");

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return apiError(400, "Invalid JSON body");
  }
  const parsed = patchSchema.safeParse(body);
  if (!parsed.success) return apiError(422, "Validation failed", parsed.error.flatten().fieldErrors);

  const data = { ...parsed.data } as Record<string, unknown>;
  if (parsed.data.status === "RESOLVED") data.resolvedAt = new Date();
  if (parsed.data.status === "CLOSED") data.closedAt = new Date();

  const ticket = await db.ticket.update({
    where: { id: Number(id) },
    data,
    include: { requester: true, assignee: true },
  });
  await writeAudit({ userId: auth.principal.userId, action: "UPDATE", entity: "Ticket", entityId: ticket.id, summary: "Updated via API" });

  return ok(serializeTicket(ticket));
}
