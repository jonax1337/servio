import type { Prisma } from "@prisma/client";
import { z } from "zod";
import { db } from "@/lib/db";
import { guard, ok, apiError, preflight, paginate, pageMeta, principalIsAgent } from "@/lib/api";
import { writeAudit } from "@/lib/audit";
import { slaCreateData } from "@/lib/sla";
import { serializeTicket } from "../_serializers";
import {
  TICKET_TYPES, TICKET_STATUSES, PRIORITIES, IMPACT_URGENCY, OPEN_TICKET_STATUSES,
  prefixForType,
} from "@/lib/constants";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export function OPTIONS() {
  return preflight();
}

export async function GET(req: Request) {
  const auth = await guard(req, "read");
  if ("response" in auth) return auth.response;

  const url = new URL(req.url);
  const { page, perPage, skip, take } = paginate(url.searchParams);

  // Non-agent tokens are scoped to the caller's own tickets (no org-wide PII).
  const where: Prisma.TicketWhereInput = principalIsAgent(auth.principal)
    ? {}
    : { requesterId: auth.principal.userId };
  const status = url.searchParams.get("status");
  const priority = url.searchParams.get("priority");
  const type = url.searchParams.get("type");
  const q = url.searchParams.get("q");
  if (status === "open") where.status = { in: [...OPEN_TICKET_STATUSES] };
  else if (status) where.status = status;
  if (priority) where.priority = priority;
  if (type) where.type = type;
  if (q) where.title = { contains: q };

  const [total, tickets] = await Promise.all([
    db.ticket.count({ where }),
    db.ticket.findMany({
      where,
      include: { requester: true, assignee: true },
      orderBy: { updatedAt: "desc" },
      skip,
      take,
    }),
  ]);

  return ok(tickets.map(serializeTicket), { meta: pageMeta(page, perPage, total) });
}

const createSchema = z.object({
  title: z.string().min(3),
  description: z.string().optional().default(""),
  type: z.enum(TICKET_TYPES).optional().default("INCIDENT"),
  priority: z.enum(PRIORITIES).optional().default("MEDIUM"),
  impact: z.enum(IMPACT_URGENCY).optional().default("MEDIUM"),
  urgency: z.enum(IMPACT_URGENCY).optional().default("MEDIUM"),
  status: z.enum(TICKET_STATUSES).optional().default("NEW"),
  requesterId: z.string().optional(),
  assigneeId: z.string().optional(),
  categoryId: z.string().optional(),
  serviceId: z.string().optional(),
});

export async function POST(req: Request) {
  const auth = await guard(req, "write");
  if ("response" in auth) return auth.response;

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return apiError(400, "Invalid JSON body");
  }
  const parsed = createSchema.safeParse(body);
  if (!parsed.success) return apiError(422, "Validation failed", parsed.error.flatten().fieldErrors);

  const isAgentPrincipal = principalIsAgent(auth.principal);
  // Non-agents can only file tickets as themselves; agents may set requesterId.
  const requesterId = isAgentPrincipal
    ? parsed.data.requesterId ?? auth.principal.userId
    : auth.principal.userId;
  // Resolve SLA + deadlines from the service/priority at creation time.
  const sla = await slaCreateData({ serviceId: parsed.data.serviceId, priority: parsed.data.priority });
  // Non-agents may not set server-controlled fields (status/assignee/queue/etc.)
  // — those fall back to schema defaults. Prevents self-assign / pre-resolved
  // tickets that would skew SLA and metrics.
  const data = isAgentPrincipal
    ? { ...parsed.data, prefix: prefixForType(parsed.data.type), ...sla, requesterId, source: "API" as const }
    : {
        title: parsed.data.title,
        description: parsed.data.description,
        type: parsed.data.type,
        prefix: prefixForType(parsed.data.type),
        priority: parsed.data.priority,
        impact: parsed.data.impact,
        urgency: parsed.data.urgency,
        ...sla,
        requesterId,
        source: "API" as const,
      };
  const ticket = await db.ticket.create({
    data,
    include: { requester: true, assignee: true },
  });
  await writeAudit({ userId: auth.principal.userId, action: "CREATE", entity: "Ticket", entityId: ticket.id, summary: "Created via API" });

  return ok(serializeTicket(ticket), { status: 201 });
}
