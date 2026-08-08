"use client";

import { useActionState } from "react";
import { Loader2, Plus } from "lucide-react";
import { createGroup, type ActionState } from "@/lib/actions/groups";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { GROUP_TYPES, GROUP_TYPE_META } from "@/lib/constants";
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

export function GroupForm({ options }: { options: FormOptions }) {
  const [state, action, pending] = useActionState<ActionState, FormData>(createGroup, undefined);
  const fe = state?.fieldErrors ?? {};
  const managerOpts = options.agents.map((a) => ({ value: a.id, label: a.name ?? a.email }));

  return (
    <form action={action} className="grid gap-5">
      {state?.error ? (
        <p className="rounded-lg border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive">
          {state.error}
        </p>
      ) : null}

      <Field label="Name" error={fe.name}>
        <Input name="name" placeholder="e.g. Network Operations" required />
      </Field>

      <div className="grid gap-5 sm:grid-cols-2">
        <Field label="Type" error={fe.type}>
          <SelectField name="type" defaultValue="TEAM" placeholder="Type"
            options={GROUP_TYPES.map((t) => ({ value: t, label: GROUP_TYPE_META[t].label }))} />
        </Field>
        <Field label="Manager">
          <SelectField name="managerId" placeholder="No manager" includeNone options={managerOpts} />
        </Field>
      </div>

      <Field label="Email" error={fe.email} hint="Shared inbox or distribution list for this group.">
        <Input name="email" type="email" placeholder="team@example.com" />
      </Field>

      <Field label="Description" error={fe.description}>
        <Textarea name="description" placeholder="What this group is responsible for…" className="min-h-28" />
      </Field>

      <div className="flex items-center justify-end gap-2 border-t pt-4">
        <Button type="submit" disabled={pending}>
          {pending ? <Loader2 className="size-4 animate-spin" /> : <Plus className="size-4" />}
          Create group
        </Button>
      </div>
    </form>
  );
}
