"use client";

import { useActionState } from "react";
import { Loader2, Plus } from "lucide-react";
import { createProblem, type ActionState } from "@/lib/actions/problems";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  PROBLEM_STATUSES, PRIORITIES, IMPACT_URGENCY,
  PROBLEM_STATUS_META, PRIORITY_META, LEVEL_META,
} from "@/lib/constants";
import type { FormOptions } from "@/lib/data/options";

function Field({
  label, error, children, hint,
}: { label: string; error?: string[]; children: React.ReactNode; hint?: string }) {
  return (
    <div className="grid gap-1.5">
      <Label>{label}</Label>
      {children}
      {hint ? <p className="text-xs text-muted-foreground">{hint}</p> : null}
      {error ? <p className="text-xs text-destructive">{error[0]}</p> : null}
    </div>
  );
}

function SelectField({
  name, defaultValue, placeholder, options, includeNone,
}: {
  name: string;
  defaultValue?: string;
  placeholder: string;
  options: { value: string; label: string }[];
  includeNone?: boolean;
}) {
  return (
    <Select
      name={name}
      defaultValue={defaultValue}
      items={{
        ...(includeNone ? { none: "— None —" } : {}),
        ...Object.fromEntries(options.map((o) => [o.value, o.label])),
      }}
    >
      <SelectTrigger className="w-full">
        <SelectValue placeholder={placeholder} />
      </SelectTrigger>
      <SelectContent>
        {includeNone ? <SelectItem value="none">— None —</SelectItem> : null}
        {options.map((o) => (
          <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}

export function ProblemForm({
  options, currentUserId,
}: {
  options: FormOptions;
  currentUserId: string;
}) {
  const [state, action, pending] = useActionState<ActionState, FormData>(createProblem, undefined);
  const fe = state?.fieldErrors ?? {};
  const agentOpts = options.agents.map((a) => ({ value: a.id, label: a.name ?? a.email }));

  return (
    <form action={action} className="grid gap-5">
      {state?.error ? (
        <p className="rounded-lg border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive">
          {state.error}
        </p>
      ) : null}

      <Field label="Title" error={fe.title}>
        <Input name="title" placeholder="Short summary of the underlying problem" required />
      </Field>

      <Field label="Description" error={fe.description}>
        <Textarea name="description" placeholder="Describe the recurring issue, affected services, symptoms…" className="min-h-32" />
      </Field>

      <div className="grid gap-5 sm:grid-cols-2">
        <Field label="Status"><SelectField name="status" defaultValue="NEW" placeholder="Status"
          options={PROBLEM_STATUSES.map((s) => ({ value: s, label: PROBLEM_STATUS_META[s].label }))} /></Field>
        <Field label="Priority"><SelectField name="priority" defaultValue="MEDIUM" placeholder="Priority"
          options={PRIORITIES.map((p) => ({ value: p, label: PRIORITY_META[p].label }))} /></Field>
        <Field label="Impact"><SelectField name="impact" defaultValue="MEDIUM" placeholder="Impact"
          options={IMPACT_URGENCY.map((l) => ({ value: l, label: LEVEL_META[l].label }))} /></Field>
        <Field label="Assignee">
          <SelectField name="assigneeId" defaultValue={currentUserId} placeholder="Unassigned" options={agentOpts} includeNone />
        </Field>
        <Field label="Group">
          <SelectField name="groupId" placeholder="No group" includeNone
            options={options.groups.map((g) => ({ value: g.id, label: g.name }))} />
        </Field>
        <Field label="Category">
          <SelectField name="categoryId" placeholder="No category" includeNone
            options={options.categories.map((c) => ({ value: c.id, label: c.name }))} />
        </Field>
      </div>

      <div className="flex items-center justify-end gap-2 border-t pt-4">
        <Button type="submit" disabled={pending}>
          {pending ? <Loader2 className="size-4 animate-spin" /> : <Plus className="size-4" />}
          Create problem
        </Button>
      </div>
    </form>
  );
}
