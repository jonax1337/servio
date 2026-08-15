"use client";

import { useTransition } from "react";
import { updateChangeField } from "@/lib/actions/changes";
import { Combobox, type ComboOption } from "@/components/combobox";
import {
  CHANGE_STATUSES,
  CHANGE_TYPES,
  RISKS,
  PRIORITIES,
  CHANGE_STATUS_META,
  CHANGE_TYPE_META,
  RISK_META,
  PRIORITY_META,
} from "@/lib/constants";
import type { FormOptions } from "@/lib/data/options";

type Field = "status" | "type" | "risk" | "priority" | "assigneeId" | "groupId" | "categoryId";

function initials(s: string) {
  return s.split(" ").map((p) => p[0]).slice(0, 2).join("").toUpperCase();
}

function Prop({
  label, changeId, field, value, options, searchable, placeholder,
}: {
  label: string;
  changeId: number;
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
          fd.set("id", String(changeId));
          fd.set("field", field);
          fd.set("value", v);
          start(() => updateChangeField(fd));
        }}
      />
    </div>
  );
}

export function ChangeProperties({
  change,
  options,
  allowedStatuses,
}: {
  change: {
    id: number;
    status: string;
    type: string;
    risk: string;
    priority: string;
    assigneeId: string | null;
    groupId: string | null;
    categoryId: string | null;
  };
  options: FormOptions;
  /** Statuses reachable from the current one under the workflow; others grey out. */
  allowedStatuses?: string[];
}) {
  const allowed = allowedStatuses ? new Set(allowedStatuses) : null;
  const statusOpts: ComboOption[] = CHANGE_STATUSES.map((s) => ({
    value: s, label: CHANGE_STATUS_META[s].label, tone: CHANGE_STATUS_META[s].tone, icon: CHANGE_STATUS_META[s].icon,
    disabled: allowed ? !allowed.has(s) : false,
    disabledReason: "Not allowed from the current status by the workflow.",
  }));
  const typeOpts: ComboOption[] = CHANGE_TYPES.map((t) => ({
    value: t, label: CHANGE_TYPE_META[t].label, tone: CHANGE_TYPE_META[t].tone, icon: CHANGE_TYPE_META[t].icon,
  }));
  const riskOpts: ComboOption[] = RISKS.map((r) => ({
    value: r, label: RISK_META[r].label, tone: RISK_META[r].tone, icon: RISK_META[r].icon,
  }));
  const prioOpts: ComboOption[] = PRIORITIES.map((p) => ({
    value: p, label: PRIORITY_META[p].label, tone: PRIORITY_META[p].tone, icon: PRIORITY_META[p].icon,
  }));
  const none = (label: string): ComboOption => ({ value: "none", label });
  // Assignee must be a member of the change's group (any agent if none).
  const memberIds = change.groupId ? new Set(options.groupMembers[change.groupId] ?? []) : null;
  const agentOpts: ComboOption[] = [
    none("Unassigned"),
    ...options.agents
      .filter((a) => !memberIds || memberIds.has(a.id) || a.id === change.assigneeId)
      .map((a) => ({ value: a.id, label: a.name ?? a.email, avatar: initials(a.name ?? a.email), hint: a.email })),
  ];
  const groupOpts: ComboOption[] = [none("No group"), ...options.groups.map((g) => ({ value: g.id, label: g.name }))];
  const catOpts: ComboOption[] = [none("No category"), ...options.categories.map((c) => ({ value: c.id, label: c.name }))];

  return (
    <div className="grid gap-3">
      <Prop label="Status" changeId={change.id} field="status" value={change.status} options={statusOpts} />
      <Prop label="Type" changeId={change.id} field="type" value={change.type} options={typeOpts} />
      <div className="grid grid-cols-2 gap-3">
        <Prop label="Risk" changeId={change.id} field="risk" value={change.risk} options={riskOpts} />
        <Prop label="Priority" changeId={change.id} field="priority" value={change.priority} options={prioOpts} />
      </div>
      <Prop label="Assignee" changeId={change.id} field="assigneeId" value={change.assigneeId} options={agentOpts} searchable placeholder="Unassigned" />
      <Prop label="Group" changeId={change.id} field="groupId" value={change.groupId} options={groupOpts} searchable placeholder="No group" />
      <Prop label="Category" changeId={change.id} field="categoryId" value={change.categoryId} options={catOpts} searchable placeholder="No category" />
    </div>
  );
}
