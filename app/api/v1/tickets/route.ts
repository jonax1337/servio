import type { Prisma } from "@prisma/client";
import { z } from "zod";
import { db } from "@/lib/db";
import { guard, ok, apiError, preflight, paginate, pageMeta } from "@/lib/api";
import { writeAudit } from "@/lib/audit";
import { serializeTicket } from "../_serializers";
import {
  TICKET_TYPES, TICKET_STATUSES, PRIORITIES, IMPACT_URGENCY, OPEN_TICKET_STATUSES,
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

  const where: Prisma.TicketWhereInput = {};
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
  queueId: z.string().optional(),
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

  const requesterId = parsed.data.requesterId ?? auth.principal.userId;
  const ticket = await db.ticket.create({
    data: { ...parsed.data, requesterId, source: "API" },
    include: { requester: true, assignee: true },
  });
  await writeAudit({ userId: auth.principal.userId, action: "CREATE", entity: "Ticket", entityId: ticket.id, summary: "Created via API" });

  return ok(serializeTicket(ticket), { status: 201 });
}
