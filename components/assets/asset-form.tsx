"use client";

import { useActionState } from "react";
import { Loader2, Plus } from "lucide-react";
import { createAsset, type ActionState } from "@/lib/actions/assets";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  ASSET_TYPES,
  ASSET_STATUSES,
  ASSET_TYPE_META,
  ASSET_STATUS_META,
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

export function AssetForm({ options }: { options: FormOptions }) {
  const [state, action, pending] = useActionState<ActionState, FormData>(
    createAsset,
    undefined,
  );
  const fe = state?.fieldErrors ?? {};
  const ownerOpts = options.agents.map((a) => ({
    value: a.id,
    label: a.name ?? a.email,
  }));

  return (
    <form action={action} className="grid gap-5">
      {state?.error ? (
        <p className="rounded-lg border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive">
          {state.error}
        </p>
      ) : null}

      <Field label="Name" error={fe.name}>
        <Input name="name" placeholder="e.g. web-prod-01" required />
      </Field>

      <div className="grid gap-5 sm:grid-cols-2">
        <Field label="Type" error={fe.type}>
          <SelectField
            name="type"
            defaultValue="SERVER"
            placeholder="Type"
            options={ASSET_TYPES.map((t) => ({
              value: t,
              label: ASSET_TYPE_META[t].label,
            }))}
          />
        </Field>
        <Field label="Status" error={fe.status}>
          <SelectField
            name="status"
            defaultValue="IN_USE"
            placeholder="Status"
            options={ASSET_STATUSES.map((s) => ({
              value: s,
              label: ASSET_STATUS_META[s].label,
            }))}
          />
        </Field>
        <Field label="Asset tag" error={fe.assetTag}>
          <Input name="assetTag" placeholder="e.g. AST-0001" />
        </Field>
        <Field label="Serial" error={fe.serial}>
          <Input name="serial" placeholder="Serial number" />
        </Field>
        <Field label="Model" error={fe.model}>
          <Input name="model" placeholder="e.g. PowerEdge R740" />
        </Field>
        <Field label="Manufacturer" error={fe.manufacturer}>
          <Input name="manufacturer" placeholder="e.g. Dell" />
        </Field>
        <Field label="Location" error={fe.location}>
          <Input name="location" placeholder="e.g. DC1 · Rack 12" />
        </Field>
        <Field label="IP address" error={fe.ipAddress}>
          <Input name="ipAddress" placeholder="e.g. 10.0.4.21" />
        </Field>
        <Field label="Operating system" error={fe.os}>
          <Input name="os" placeholder="e.g. Ubuntu 22.04 LTS" />
        </Field>
      </div>

      <div className="grid gap-5 sm:grid-cols-2">
        <Field label="Owner">
          <SelectField
            name="ownerId"
            placeholder="Unassigned"
            options={ownerOpts}
            includeNone
          />
        </Field>
        <Field label="Group">
          <SelectField
            name="groupId"
            placeholder="No group"
            includeNone
            options={options.groups.map((g) => ({
              value: g.id,
              label: g.name,
            }))}
          />
        </Field>
      </div>

      <div className="flex items-center justify-end gap-2 border-t pt-4">
        <Button type="submit" disabled={pending}>
          {pending ? (
            <Loader2 className="size-4 animate-spin" />
          ) : (
            <Plus className="size-4" />
          )}
          Create asset
        </Button>
      </div>
    </form>
  );
}
