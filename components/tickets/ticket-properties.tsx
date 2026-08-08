"use client";

import { useTransition } from "react";
import { Loader2 } from "lucide-react";
import { updateTicketField } from "@/lib/actions/tickets";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  TICKET_STATUSES,
  PRIORITIES,
  IMPACT_URGENCY,
  TICKET_STATUS_META,
  PRIORITY_META,
  LEVEL_META,
} from "@/lib/constants";
import type { FormOptions } from "@/lib/data/options";

type Field =
  | "status" | "priority" | "impact" | "urgency"
  | "assigneeId" | "groupId" | "queueId" | "categoryId" | "serviceId";

function Row({
  label,
  ticketId,
  field,
  value,
  options,
  includeNone,
}: {
  label: string;
  ticketId: number;
  field: Field;
  value: string | null;
  options: { value: string; label: string }[];
  includeNone?: boolean;
}) {
  const [pending, start] = useTransition();
  return (
    <div className="grid grid-cols-[100px_1fr] items-center gap-2">
      <span className="text-xs font-medium text-muted-foreground">{label}</span>
      <div className="relative">
        <Select
          items={{
            ...(includeNone ? { none: "Unassigned" } : {}),
            ...Object.fromEntries(options.map((o) => [o.value, o.label])),
          }}
          value={value ?? "none"}
          onValueChange={(v) => {
            const fd = new FormData();
            fd.set("id", String(ticketId));
            fd.set("field", field);
            fd.set("value", v);
            start(() => updateTicketField(fd));
          }}
        >
          <SelectTrigger size="sm" className="w-full">
            <SelectValue placeholder="—" />
          </SelectTrigger>
          <SelectContent>
            {includeNone ? <SelectItem value="none">Unassigned</SelectItem> : null}
            {options.map((o) => (
              <SelectItem key={o.value} value={o.value}>
                {o.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        {pending ? (
          <Loader2 className="absolute right-7 top-1/2 size-3.5 -translate-y-1/2 animate-spin text-muted-foreground" />
        ) : null}
      </div>
    </div>
  );
}

export function TicketProperties({
  ticket,
  options,
}: {
  ticket: {
    id: number;
    status: string;
    priority: string;
    impact: string;
    urgency: string;
    assigneeId: string | null;
    groupId: string | null;
    queueId: string | null;
    categoryId: string | null;
    serviceId: string | null;
  };
  options: FormOptions;
}) {
  return (
    <div className="grid gap-2.5">
      <Row label="Status" ticketId={ticket.id} field="status" value={ticket.status}
        options={TICKET_STATUSES.map((s) => ({ value: s, label: TICKET_STATUS_META[s].label }))} />
      <Row label="Priority" ticketId={ticket.id} field="priority" value={ticket.priority}
        options={PRIORITIES.map((p) => ({ value: p, label: PRIORITY_META[p].label }))} />
      <Row label="Assignee" ticketId={ticket.id} field="assigneeId" value={ticket.assigneeId} includeNone
        options={options.agents.map((a) => ({ value: a.id, label: a.name ?? a.email }))} />
      <Row label="Group" ticketId={ticket.id} field="groupId" value={ticket.groupId} includeNone
        options={options.groups.map((g) => ({ value: g.id, label: g.name }))} />
      <Row label="Queue" ticketId={ticket.id} field="queueId" value={ticket.queueId} includeNone
        options={options.queues.map((qq) => ({ value: qq.id, label: qq.name }))} />
      <Row label="Category" ticketId={ticket.id} field="categoryId" value={ticket.categoryId} includeNone
        options={options.categories.map((c) => ({ value: c.id, label: c.name }))} />
      <Row label="Service" ticketId={ticket.id} field="serviceId" value={ticket.serviceId} includeNone
        options={options.services.map((s) => ({ value: s.id, label: s.name }))} />
      <Row label="Impact" ticketId={ticket.id} field="impact" value={ticket.impact}
        options={IMPACT_URGENCY.map((l) => ({ value: l, label: LEVEL_META[l].label }))} />
      <Row label="Urgency" ticketId={ticket.id} field="urgency" value={ticket.urgency}
        options={IMPACT_URGENCY.map((l) => ({ value: l, label: LEVEL_META[l].label }))} />
    </div>
  );
}
