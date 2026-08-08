import { ticketRef } from "@/lib/constants";

type Userish = { id: string; name: string | null; email: string } | null;

function user(u: Userish) {
  return u ? { id: u.id, name: u.name, email: u.email } : null;
}

export function serializeTicket(t: {
  id: number;
  title: string;
  description: string;
  type: string;
  status: string;
  priority: string;
  impact: string;
  urgency: string;
  source: string;
  requester?: Userish;
  assignee?: Userish;
  queueId: string | null;
  categoryId: string | null;
  serviceId: string | null;
  dueAt: Date | null;
  resolvedAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
}) {
  return {
    id: t.id,
    ref: ticketRef(t.id, t.type),
    title: t.title,
    description: t.description,
    type: t.type,
    status: t.status,
    priority: t.priority,
    impact: t.impact,
    urgency: t.urgency,
    source: t.source,
    requester: user(t.requester ?? null),
    assignee: user(t.assignee ?? null),
    queue_id: t.queueId,
    category_id: t.categoryId,
    service_id: t.serviceId,
    due_at: t.dueAt?.toISOString() ?? null,
    resolved_at: t.resolvedAt?.toISOString() ?? null,
    created_at: t.createdAt.toISOString(),
    updated_at: t.updatedAt.toISOString(),
  };
}

export function serializeAsset(a: {
  id: string;
  assetTag: string | null;
  name: string;
  type: string;
  status: string;
  serial: string | null;
  model: string | null;
  manufacturer: string | null;
  location: string | null;
  ipAddress: string | null;
  os: string | null;
  owner?: Userish;
  createdAt: Date;
  updatedAt: Date;
}) {
  return {
    id: a.id,
    asset_tag: a.assetTag,
    name: a.name,
    type: a.type,
    status: a.status,
    serial: a.serial,
    model: a.model,
    manufacturer: a.manufacturer,
    location: a.location,
    ip_address: a.ipAddress,
    os: a.os,
    owner: user(a.owner ?? null),
    created_at: a.createdAt.toISOString(),
    updated_at: a.updatedAt.toISOString(),
  };
}
