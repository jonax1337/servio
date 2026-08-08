"use client";

import { useTransition } from "react";
import { Loader2 } from "lucide-react";
import { updateChangeField } from "@/lib/actions/changes";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
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

function Row({
  label,
  changeId,
  field,
  value,
  options,
  includeNone,
}: {
  label: string;
  changeId: number;
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
            fd.set("id", String(changeId));
            fd.set("field", field);
            fd.set("value", (v as string | null) ?? "none");
            start(() => updateChangeField(fd));
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

export function ChangeProperties({
  change,
  options,
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
}) {
  return (
    <div className="grid gap-2.5">
      <Row label="Status" changeId={change.id} field="status" value={change.status}
        options={CHANGE_STATUSES.map((s) => ({ value: s, label: CHANGE_STATUS_META[s].label }))} />
      <Row label="Type" changeId={change.id} field="type" value={change.type}
        options={CHANGE_TYPES.map((t) => ({ value: t, label: CHANGE_TYPE_META[t].label }))} />
      <Row label="Risk" changeId={change.id} field="risk" value={change.risk}
        options={RISKS.map((r) => ({ value: r, label: RISK_META[r].label }))} />
      <Row label="Priority" changeId={change.id} field="priority" value={change.priority}
        options={PRIORITIES.map((p) => ({ value: p, label: PRIORITY_META[p].label }))} />
      <Row label="Assignee" changeId={change.id} field="assigneeId" value={change.assigneeId} includeNone
        options={options.agents.map((a) => ({ value: a.id, label: a.name ?? a.email }))} />
      <Row label="Group" changeId={change.id} field="groupId" value={change.groupId} includeNone
        options={options.groups.map((g) => ({ value: g.id, label: g.name }))} />
      <Row label="Category" changeId={change.id} field="categoryId" value={change.categoryId} includeNone
        options={options.categories.map((c) => ({ value: c.id, label: c.name }))} />
    </div>
  );
}
