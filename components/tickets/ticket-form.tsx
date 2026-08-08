"use client";

import { useActionState } from "react";
import { Loader2, Plus } from "lucide-react";
import { createTicket, type ActionState } from "@/lib/actions/tickets";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  TICKET_TYPES, PRIORITIES, IMPACT_URGENCY,
  TICKET_TYPE_META, PRIORITY_META, LEVEL_META,
} from "@/lib/constants";
import type { FormOptions } from "@/lib/data/options";

type UserOpt = { id: string; name: string | null; email: string };

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

export function TicketForm({
  options, requesters, currentUserId,
}: {
  options: FormOptions;
  requesters: UserOpt[];
  currentUserId: string;
}) {
  const [state, action, pending] = useActionState<ActionState, FormData>(createTicket, undefined);
  const fe = state?.fieldErrors ?? {};
  const userOpts = requesters.map((u) => ({ value: u.id, label: u.name ?? u.email }));
  const agentOpts = options.agents.map((a) => ({ value: a.id, label: a.name ?? a.email }));

  return (
    <form action={action} className="grid gap-5">
      {state?.error ? (
        <p className="rounded-lg border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive">
          {state.error}
        </p>
      ) : null}

      <Field label="Subject" error={fe.title}>
        <Input name="title" placeholder="Short summary of the issue or request" required />
      </Field>

      <Field label="Description" error={fe.description}>
        <Textarea name="description" placeholder="Describe the problem, steps to reproduce, impact…" className="min-h-32" />
      </Field>

      <div className="grid gap-5 sm:grid-cols-2">
        <Field label="Type"><SelectField name="type" defaultValue="INCIDENT" placeholder="Type"
          options={TICKET_TYPES.map((t) => ({ value: t, label: TICKET_TYPE_META[t].label }))} /></Field>
        <Field label="Priority"><SelectField name="priority" defaultValue="MEDIUM" placeholder="Priority"
          options={PRIORITIES.map((p) => ({ value: p, label: PRIORITY_META[p].label }))} /></Field>
        <Field label="Impact"><SelectField name="impact" defaultValue="MEDIUM" placeholder="Impact"
          options={IMPACT_URGENCY.map((l) => ({ value: l, label: LEVEL_META[l].label }))} /></Field>
        <Field label="Urgency"><SelectField name="urgency" defaultValue="MEDIUM" placeholder="Urgency"
          options={IMPACT_URGENCY.map((l) => ({ value: l, label: LEVEL_META[l].label }))} /></Field>
      </div>

      <div className="grid gap-5 sm:grid-cols-2">
        <Field label="Requester" error={fe.requesterId}>
          <SelectField name="requesterId" defaultValue={requesters[0]?.id} placeholder="Who reported it" options={userOpts} />
        </Field>
        <Field label="Assignee">
          <SelectField name="assigneeId" defaultValue={currentUserId} placeholder="Unassigned" options={agentOpts} includeNone />
        </Field>
        <Field label="Group">
          <SelectField name="groupId" placeholder="No group" includeNone
            options={options.groups.map((g) => ({ value: g.id, label: g.name }))} />
        </Field>
        <Field label="Queue">
          <SelectField name="queueId" placeholder="No queue" includeNone
            options={options.queues.map((qq) => ({ value: qq.id, label: qq.name }))} />
        </Field>
        <Field label="Category">
          <SelectField name="categoryId" placeholder="No category" includeNone
            options={options.categories.map((c) => ({ value: c.id, label: c.name }))} />
        </Field>
        <Field label="Service">
          <SelectField name="serviceId" placeholder="No service" includeNone
            options={options.services.map((s) => ({ value: s.id, label: s.name }))} />
        </Field>
      </div>

      <div className="flex items-center justify-end gap-2 border-t pt-4">
        <Button type="submit" disabled={pending}>
          {pending ? <Loader2 className="size-4 animate-spin" /> : <Plus className="size-4" />}
          Create ticket
        </Button>
      </div>
    </form>
  );
}
