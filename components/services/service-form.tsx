"use client";

import { useActionState } from "react";
import { Loader2, Plus } from "lucide-react";
import { createService, type ActionState } from "@/lib/actions/services";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  SERVICE_STATUSES,
  CRITICALITIES,
  SERVICE_STATUS_META,
  CRITICALITY_META,
} from "@/lib/constants";
import type { FormOptions } from "@/lib/data/options";

function Field({
  label,
  error,
  children,
  hint,
}: {
  label: string;
  error?: string[];
  children: React.ReactNode;
  hint?: string;
}) {
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
  name,
  defaultValue,
  placeholder,
  options,
  includeNone,
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
          <SelectItem key={o.value} value={o.value}>
            {o.label}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}

export function ServiceForm({ options }: { options: FormOptions }) {
  const [state, action, pending] = useActionState<ActionState, FormData>(
    createService,
    undefined,
  );
  const fe = state?.fieldErrors ?? {};

  return (
    <form action={action} className="grid gap-5">
      {state?.error ? (
        <p className="rounded-lg border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive">
          {state.error}
        </p>
      ) : null}

      <Field label="Name" error={fe.name}>
        <Input name="name" placeholder="e.g. Email & Calendar" required />
      </Field>

      <Field label="Description" error={fe.description}>
        <Textarea
          name="description"
          placeholder="What this service provides and who depends on it…"
          className="min-h-28"
        />
      </Field>

      <div className="grid gap-5 sm:grid-cols-2">
        <Field label="Status">
          <SelectField
            name="status"
            defaultValue="OPERATIONAL"
            placeholder="Status"
            options={SERVICE_STATUSES.map((s) => ({
              value: s,
              label: SERVICE_STATUS_META[s].label,
            }))}
          />
        </Field>
        <Field label="Criticality">
          <SelectField
            name="criticality"
            defaultValue="MEDIUM"
            placeholder="Criticality"
            options={CRITICALITIES.map((c) => ({
              value: c,
              label: CRITICALITY_META[c].label,
            }))}
          />
        </Field>
        <Field label="Owner">
          <SelectField
            name="ownerId"
            placeholder="No owner"
            includeNone
            options={options.agents.map((a) => ({
              value: a.id,
              label: a.name ?? a.email,
            }))}
          />
        </Field>
        <Field label="Category">
          <SelectField
            name="categoryId"
            placeholder="No category"
            includeNone
            options={options.categories.map((c) => ({
              value: c.id,
              label: c.name,
            }))}
          />
        </Field>
        <Field label="SLA">
          <SelectField
            name="slaId"
            placeholder="No SLA"
            includeNone
            options={options.slas.map((s) => ({ value: s.id, label: s.name }))}
          />
        </Field>
      </div>

      <div className="flex items-center justify-between rounded-lg border px-3 py-2.5">
        <div className="grid gap-0.5">
          <Label htmlFor="isPublic">Public in service catalog</Label>
          <p className="text-xs text-muted-foreground">
            Show this service to end users in the self-service portal.
          </p>
        </div>
        <Switch id="isPublic" name="isPublic" defaultChecked />
      </div>

      <div className="flex items-center justify-end gap-2 border-t pt-4">
        <Button type="submit" disabled={pending}>
          {pending ? (
            <Loader2 className="size-4 animate-spin" />
          ) : (
            <Plus className="size-4" />
          )}
          Create service
        </Button>
      </div>
    </form>
  );
}
