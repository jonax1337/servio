"use client";

import { useActionState } from "react";
import { Loader2, Plus } from "lucide-react";
import { createService, type ActionState } from "@/lib/actions/services";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { ComboField } from "@/components/combo-field";
import type { ComboOption } from "@/components/combobox";
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

const initials = (s: string) =>
  s.split(" ").map((p) => p[0]).slice(0, 2).join("").toUpperCase();

export function ServiceForm({ options }: { options: FormOptions }) {
  const [state, action, pending] = useActionState<ActionState, FormData>(
    createService,
    undefined,
  );
  const fe = state?.fieldErrors ?? {};

  const statusOpts: ComboOption[] = SERVICE_STATUSES.map((s) => ({
    value: s,
    label: SERVICE_STATUS_META[s].label,
    tone: SERVICE_STATUS_META[s].tone,
    icon: SERVICE_STATUS_META[s].icon,
  }));
  const critOpts: ComboOption[] = CRITICALITIES.map((c) => ({
    value: c,
    label: CRITICALITY_META[c].label,
    tone: CRITICALITY_META[c].tone,
    icon: CRITICALITY_META[c].icon,
  }));
  const ownerOpts: ComboOption[] = options.agents.map((a) => ({
    value: a.id,
    label: a.name ?? a.email,
    avatar: initials(a.name ?? a.email),
    hint: a.email,
  }));
  const catOpts: ComboOption[] = options.categories.map((c) => ({
    value: c.id,
    label: c.name,
    hint: c.type,
  }));
  const slaOpts: ComboOption[] = options.slas.map((s) => ({
    value: s.id,
    label: s.name,
  }));

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
          <ComboField name="status" defaultValue="OPERATIONAL" options={statusOpts} />
        </Field>
        <Field label="Criticality">
          <ComboField name="criticality" defaultValue="MEDIUM" options={critOpts} />
        </Field>
        <Field label="Owner">
          <ComboField
            name="ownerId"
            options={ownerOpts}
            includeNone
            noneLabel="No owner"
          />
        </Field>
        <Field label="Category">
          <ComboField
            name="categoryId"
            options={catOpts}
            includeNone
            noneLabel="No category"
          />
        </Field>
        <Field label="SLA">
          <ComboField name="slaId" options={slaOpts} includeNone noneLabel="No SLA" />
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
