"use client";

import { useTransition } from "react";
import { Loader2 } from "lucide-react";
import { updateProblemField } from "@/lib/actions/problems";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  PROBLEM_STATUSES,
  PRIORITIES,
  IMPACT_URGENCY,
  PROBLEM_STATUS_META,
  PRIORITY_META,
  LEVEL_META,
} from "@/lib/constants";
import type { FormOptions } from "@/lib/data/options";

type Field =
  | "status" | "priority" | "impact"
  | "assigneeId" | "groupId" | "categoryId";

function Row({
  label,
  problemId,
  field,
  value,
  options,
  includeNone,
}: {
  label: string;
  problemId: number;
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
            fd.set("id", String(problemId));
            fd.set("field", field);
            fd.set("value", v ?? "none");
            start(() => updateProblemField(fd));
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

export function ProblemProperties({
  problem,
  options,
}: {
  problem: {
    id: number;
    status: string;
    priority: string;
    impact: string;
    assigneeId: string | null;
    groupId: string | null;
    categoryId: string | null;
  };
  options: FormOptions;
}) {
  return (
    <div className="grid gap-2.5">
      <Row label="Status" problemId={problem.id} field="status" value={problem.status}
        options={PROBLEM_STATUSES.map((s) => ({ value: s, label: PROBLEM_STATUS_META[s].label }))} />
      <Row label="Priority" problemId={problem.id} field="priority" value={problem.priority}
        options={PRIORITIES.map((p) => ({ value: p, label: PRIORITY_META[p].label }))} />
      <Row label="Impact" problemId={problem.id} field="impact" value={problem.impact}
        options={IMPACT_URGENCY.map((l) => ({ value: l, label: LEVEL_META[l].label }))} />
      <Row label="Assignee" problemId={problem.id} field="assigneeId" value={problem.assigneeId} includeNone
        options={options.agents.map((a) => ({ value: a.id, label: a.name ?? a.email }))} />
      <Row label="Group" problemId={problem.id} field="groupId" value={problem.groupId} includeNone
        options={options.groups.map((g) => ({ value: g.id, label: g.name }))} />
      <Row label="Category" problemId={problem.id} field="categoryId" value={problem.categoryId} includeNone
        options={options.categories.map((c) => ({ value: c.id, label: c.name }))} />
    </div>
  );
}
