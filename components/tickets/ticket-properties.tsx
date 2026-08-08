"use client";

import { useState, useTransition } from "react";
import { updateTicketField } from "@/lib/actions/tickets";
import { Combobox, type ComboOption } from "@/components/combobox";
import { PendingReasonDialog } from "@/components/tickets/pending-reason-dialog";
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

function initials(s: string) {
  return s.split(" ").map((p) => p[0]).slice(0, 2).join("").toUpperCase();
}

function Prop({
  label, ticketId, field, value, options, searchable, placeholder,
}: {
  label: string;
  ticketId: number;
  field: Field;
  value: string | null;
  options: ComboOption[];
  searchable?: boolean;
  placeholder?: string;
}) {
  const [pending, start] = useTransition();
  return (
    <div className="grid gap-1.5">
      <span className="text-xs font-medium text-muted-foreground">{label}</span>
      <Combobox
        options={options}
        value={value ?? "none"}
        pending={pending}
        placeholder={placeholder}
        searchPlaceholder={searchable ? `Search ${label.toLowerCase()}…` : "Filter…"}
        onChange={(v) => {
          const fd = new FormData();
          fd.set("id", String(ticketId));
          fd.set("field", field);
          fd.set("value", v);
          start(() => updateTicketField(fd));
        }}
      />
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
  const statusOpts: ComboOption[] = TICKET_STATUSES.map((s) => ({
    value: s, label: TICKET_STATUS_META[s].label, tone: TICKET_STATUS_META[s].tone, icon: TICKET_STATUS_META[s].icon,
  }));
  const prioOpts: ComboOption[] = PRIORITIES.map((p) => ({
    value: p, label: PRIORITY_META[p].label, tone: PRIORITY_META[p].tone, icon: PRIORITY_META[p].icon,
  }));
  const levelOpts: ComboOption[] = IMPACT_URGENCY.map((l) => ({
    value: l, label: LEVEL_META[l].label, tone: LEVEL_META[l].tone,
  }));
  const none = (label: string): ComboOption => ({ value: "none", label });
  const agentOpts: ComboOption[] = [
    none("Unassigned"),
    ...options.agents.map((a) => ({ value: a.id, label: a.name ?? a.email, avatar: initials(a.name ?? a.email), hint: a.email })),
  ];
  const groupOpts: ComboOption[] = [none("No group"), ...options.groups.map((g) => ({ value: g.id, label: g.name }))];
  const queueOpts: ComboOption[] = [none("No queue"), ...options.queues.map((q) => ({ value: q.id, label: q.name }))];
  const catOpts: ComboOption[] = [none("No category"), ...options.categories.map((c) => ({ value: c.id, label: c.name }))];
  const svcOpts: ComboOption[] = [none("No service"), ...options.services.map((s) => ({ value: s.id, label: s.name }))];

  const [statusPending, startStatus] = useTransition();
  const [pendingDlg, setPendingDlg] = useState<{ open: boolean; status: string }>({ open: false, status: "PENDING" });

  const changeStatus = (v: string) => {
    if (v === "PENDING" || v === "ON_HOLD") {
      setPendingDlg({ open: true, status: v });
      return;
    }
    const fd = new FormData();
    fd.set("id", String(ticket.id));
    fd.set("field", "status");
    fd.set("value", v);
    startStatus(() => updateTicketField(fd));
  };

  return (
    <div className="grid gap-3">
      <div className="grid gap-1.5">
        <span className="text-xs font-medium text-muted-foreground">Status</span>
        <Combobox options={statusOpts} value={ticket.status} pending={statusPending} onChange={changeStatus} />
      </div>
      <PendingReasonDialog
        ticketId={ticket.id}
        status={pendingDlg.status}
        open={pendingDlg.open}
        onOpenChange={(o) => setPendingDlg((s) => ({ ...s, open: o }))}
      />
      <Prop label="Priority" ticketId={ticket.id} field="priority" value={ticket.priority} options={prioOpts} />
      <Prop label="Assignee" ticketId={ticket.id} field="assigneeId" value={ticket.assigneeId} options={agentOpts} searchable placeholder="Unassigned" />
      <Prop label="Group" ticketId={ticket.id} field="groupId" value={ticket.groupId} options={groupOpts} searchable placeholder="No group" />
      <Prop label="Queue" ticketId={ticket.id} field="queueId" value={ticket.queueId} options={queueOpts} searchable placeholder="No queue" />
      <Prop label="Category" ticketId={ticket.id} field="categoryId" value={ticket.categoryId} options={catOpts} searchable placeholder="No category" />
      <Prop label="Service" ticketId={ticket.id} field="serviceId" value={ticket.serviceId} options={svcOpts} searchable placeholder="No service" />
      <div className="grid grid-cols-2 gap-3">
        <Prop label="Impact" ticketId={ticket.id} field="impact" value={ticket.impact} options={levelOpts} />
        <Prop label="Urgency" ticketId={ticket.id} field="urgency" value={ticket.urgency} options={levelOpts} />
      </div>
    </div>
  );
}
