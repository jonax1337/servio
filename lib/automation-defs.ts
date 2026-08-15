// Shared, client-safe definitions for the automation rule builder & engine.

export const TRIGGERS = [
  { value: "TICKET_CREATED", label: "When a ticket is created" },
  { value: "TICKET_UPDATED", label: "When a ticket is updated" },
  { value: "TICKET_SLA_AT_RISK", label: "When a ticket's SLA is at risk" },
  { value: "TICKET_SLA_BREACHED", label: "When a ticket's SLA is breached" },
] as const;

export const MATCH_TYPES = [
  { value: "ALL", label: "Match ALL conditions" },
  { value: "ANY", label: "Match ANY condition" },
] as const;

export const CONDITION_FIELDS = [
  { value: "type", label: "Type" },
  { value: "status", label: "Status" },
  { value: "priority", label: "Priority" },
  { value: "impact", label: "Impact" },
  { value: "urgency", label: "Urgency" },
  { value: "source", label: "Source" },
  { value: "title", label: "Title" },
  { value: "categoryId", label: "Category" },
  { value: "groupId", label: "Group" },
  { value: "serviceId", label: "Service" },
  { value: "assigneeId", label: "Assignee" },
  { value: "requesterVip", label: "Requester is VIP" },
  { value: "responseBreached", label: "Response SLA breached" },
  { value: "resolveBreached", label: "Resolve SLA breached" },
] as const;

export const OPERATORS = [
  { value: "eq", label: "is" },
  { value: "ne", label: "is not" },
  { value: "contains", label: "contains" },
  { value: "empty", label: "is empty" },
  { value: "not_empty", label: "is not empty" },
] as const;

export const ACTION_TYPES = [
  { value: "set_status", label: "Set status" },
  { value: "set_priority", label: "Set priority" },
  { value: "assign", label: "Assign to agent" },
  { value: "set_group", label: "Set group" },
  { value: "escalate", label: "Escalate priority (+1)" },
  { value: "major_incident", label: "Declare Major Incident" },
  { value: "notify", label: "Notify agent" },
  { value: "notify_group", label: "Notify ticket's group" },
  { value: "webhook", label: "Call webhook (POST)" },
  { value: "internal_note", label: "Add internal note" },
] as const;

export type Condition = { field: string; op: string; value?: string };
export type AutomationAction = { type: string; value?: string };

export function parseJson<T>(s: string | null | undefined, fallback: T): T {
  if (!s) return fallback;
  try {
    return JSON.parse(s) as T;
  } catch {
    return fallback;
  }
}
