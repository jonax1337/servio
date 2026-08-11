"use client";

import { useActionState, useEffect, useRef, useState } from "react";
import { useFormStatus } from "react-dom";
import { Loader2, Save, Trash2, Plug } from "lucide-react";
import { toast } from "sonner";
import {
  createSyncSource,
  updateSyncSource,
  deleteSyncSource,
  testSyncConnection,
  type ActionState,
} from "@/lib/actions/syncs";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Combobox } from "@/components/combobox";
import { ComboField } from "@/components/combo-field";
import { LinkButton } from "@/components/link-button";

/** LDAP config as plain form values (no secret — the password is write-only). */
export type LdapFormValues = {
  url: string;
  baseDN: string;
  bindDN: string;
  userFilter: string;
  scope: string;
  pageSize: number;
  tlsRejectUnauthorized: boolean;
  deactivateMissing: boolean;
  attr: {
    externalId: string;
    email: string;
    name: string;
    jobTitle: string;
    phone: string;
    department: string;
  };
};

const TYPE_OPTIONS = [
  { value: "ACTIVE_DIRECTORY", label: "Active Directory" },
  { value: "LDAP", label: "LDAP" },
];
const SCOPE_OPTIONS = [
  { value: "sub", label: "Subtree (all descendants)" },
  { value: "one", label: "One level (direct children)" },
];

function Field({
  name,
  label,
  defaultValue,
  placeholder,
  type = "text",
  hint,
  mono = false,
}: {
  name: string;
  label: string;
  defaultValue?: string | number;
  placeholder?: string;
  type?: string;
  hint?: string;
  mono?: boolean;
}) {
  return (
    <div className="grid gap-1.5">
      <Label htmlFor={`f-${name}`}>{label}</Label>
      <Input
        id={`f-${name}`}
        name={name}
        type={type}
        defaultValue={defaultValue}
        placeholder={placeholder}
        className={mono ? "font-mono text-xs" : undefined}
      />
      {hint ? <p className="text-xs text-muted-foreground">{hint}</p> : null}
    </div>
  );
}

function SubmitButton({ label }: { label: string }) {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" disabled={pending}>
      {pending ? <Loader2 className="size-4 animate-spin" /> : <Save className="size-4" />}
      {label}
    </Button>
  );
}

export function SyncSourceForm({
  mode,
  source,
  values,
  passwordSet = false,
  presets,
}: {
  mode: "create" | "edit";
  source?: { id: string; name: string; type: string; schedule: string | null };
  values: LdapFormValues;
  passwordSet?: boolean;
  presets?: Record<string, LdapFormValues>;
}) {
  const [type, setType] = useState(source?.type ?? "ACTIVE_DIRECTORY");
  const action = mode === "create" ? createSyncSource : updateSyncSource;
  const [state, formAction] = useActionState<ActionState, FormData>(action, undefined);
  const wasErr = useRef<string | undefined>(undefined);

  useEffect(() => {
    if (state?.error && state.error !== wasErr.current) toast.error(state.error);
    wasErr.current = state?.error;
  }, [state]);

  // In create mode, switching the type reloads that type's sensible defaults.
  const cfg: LdapFormValues =
    mode === "create" && presets?.[type] ? presets[type] : values;

  return (
    <div className="grid max-w-2xl gap-4">
      <form action={formAction} className="grid gap-6 rounded-xl border bg-card p-5">
        {mode === "edit" && source ? <input type="hidden" name="id" value={source.id} /> : null}

        <div className="grid gap-4">
          <Field name="name" label="Name" defaultValue={source?.name} placeholder="Corporate Active Directory" />

          <div className="grid gap-1.5">
            <Label>Type</Label>
            {mode === "create" ? (
              <Combobox
                name="type"
                options={TYPE_OPTIONS}
                value={type}
                onChange={setType}
                searchPlaceholder="Search…"
              />
            ) : (
              <p className="text-sm font-medium">
                {TYPE_OPTIONS.find((t) => t.value === type)?.label ?? type}
              </p>
            )}
            <p className="text-xs text-muted-foreground">
              Imports users into Servio. More connectors (Azure AD, CSV, REST) are coming.
            </p>
          </div>

          <Field
            name="schedule"
            label="Schedule (cron)"
            defaultValue={source?.schedule ?? ""}
            placeholder="0 * * * *"
            mono
            hint="Optional. Leave blank to run manually only. Automatic scheduled runs are wired up in a later step."
          />
        </div>

        {/* Type-specific config remounts on type change to reload preset defaults. */}
        <div key={type} className="grid gap-6">
          <section className="grid gap-4">
            <h3 className="text-sm font-semibold">Connection</h3>
            <Field name="ldap_url" label="Server URL" defaultValue={cfg.url} placeholder="ldaps://dc01.corp.local:636" mono />
            <Field name="ldap_bindDN" label="Bind DN" defaultValue={cfg.bindDN} placeholder="CN=svc-servio,…" mono />
            <div className="grid gap-1.5">
              <div className="flex items-center justify-between gap-2">
                <Label htmlFor="f-ldap_bindPassword">Bind password</Label>
                {passwordSet ? (
                  <span className="rounded-full bg-emerald-500/10 px-2 py-0.5 text-[11px] font-medium text-emerald-600 dark:text-emerald-400">
                    Configured
                  </span>
                ) : null}
              </div>
              <Input
                id="f-ldap_bindPassword"
                name="ldap_bindPassword"
                type="password"
                autoComplete="new-password"
                placeholder={passwordSet ? "•••••••• (leave blank to keep)" : ""}
              />
            </div>
            <label className="flex items-center justify-between gap-4">
              <span className="text-sm font-medium">Verify TLS certificate</span>
              <Switch name="ldap_tlsRejectUnauthorized" defaultChecked={cfg.tlsRejectUnauthorized} />
            </label>
          </section>

          <section className="grid gap-4">
            <h3 className="text-sm font-semibold">Directory</h3>
            <Field name="ldap_baseDN" label="Base DN" defaultValue={cfg.baseDN} placeholder="DC=corp,DC=local" mono />
            <Field name="ldap_userFilter" label="User filter" defaultValue={cfg.userFilter} mono />
            <div className="grid gap-1.5">
              <Label>Search scope</Label>
              <ComboField key={`scope-${type}`} name="ldap_scope" options={SCOPE_OPTIONS} defaultValue={cfg.scope} />
            </div>
            <Field name="ldap_pageSize" label="Page size" type="number" defaultValue={cfg.pageSize} placeholder="500" />
          </section>

          <section className="grid gap-4">
            <h3 className="text-sm font-semibold">Attribute mapping</h3>
            <p className="-mt-2 text-xs text-muted-foreground">
              LDAP attribute → Servio user field. <span className="font-medium">External ID</span> and{" "}
              <span className="font-medium">Email</span> are required per entry.
            </p>
            <div className="grid gap-4 sm:grid-cols-2">
              <Field name="attr_externalId" label="External ID" defaultValue={cfg.attr.externalId} mono />
              <Field name="attr_email" label="Email" defaultValue={cfg.attr.email} mono />
              <Field name="attr_name" label="Full name" defaultValue={cfg.attr.name} mono />
              <Field name="attr_jobTitle" label="Job title" defaultValue={cfg.attr.jobTitle} mono />
              <Field name="attr_phone" label="Phone" defaultValue={cfg.attr.phone} mono />
              <Field name="attr_department" label="Department" defaultValue={cfg.attr.department} mono />
            </div>
          </section>

          <label className="flex items-center justify-between gap-4">
            <span className="grid gap-0.5">
              <span className="text-sm font-medium">Deactivate users removed from the directory</span>
              <span className="text-xs text-muted-foreground">
                Sets isActive=false for users no longer returned (never deletes — ticket history is kept).
              </span>
            </span>
            <Switch name="ldap_deactivateMissing" defaultChecked={cfg.deactivateMissing} />
          </label>
        </div>

        <div className="flex items-center justify-end gap-2">
          <LinkButton href={mode === "edit" && source ? `/syncs/${source.id}` : "/syncs"} variant="ghost">
            Cancel
          </LinkButton>
          <SubmitButton label={mode === "create" ? "Create source" : "Save changes"} />
        </div>
      </form>

      {mode === "edit" && source ? (
        <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border bg-card p-4">
          <TestConnectionButton id={source.id} />
          <DeleteButton id={source.id} name={source.name} />
        </div>
      ) : null}
    </div>
  );
}

function TestConnectionButton({ id }: { id: string }) {
  const [state, formAction] = useActionState<
    { error?: string; ok?: boolean; message?: string },
    FormData
  >(testSyncConnection, {});

  useEffect(() => {
    if (state?.ok && state.message) toast.success(state.message);
    else if (state?.error) toast.error(state.error);
  }, [state]);

  return (
    <form action={formAction} className="flex items-center gap-3">
      <input type="hidden" name="id" value={id} />
      <TestSubmit />
      {state?.message && state.ok ? (
        <span className="text-xs text-emerald-600 dark:text-emerald-400">Connection OK</span>
      ) : state?.error ? (
        <span className="max-w-[280px] truncate text-xs text-red-600 dark:text-red-400" title={state.error}>
          {state.error}
        </span>
      ) : (
        <span className="text-xs text-muted-foreground">Verify the bind &amp; base DN.</span>
      )}
    </form>
  );
}

function TestSubmit() {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" variant="outline" size="sm" disabled={pending}>
      {pending ? <Loader2 className="size-4 animate-spin" /> : <Plug className="size-4" />}
      Test connection
    </Button>
  );
}

function DeleteButton({ id, name }: { id: string; name: string }) {
  return (
    <form
      action={async (fd) => {
        if (!confirm(`Delete sync source "${name}"? Imported users are kept but unlinked.`)) return;
        await deleteSyncSource(fd);
      }}
    >
      <input type="hidden" name="id" value={id} />
      <DeleteSubmit />
    </form>
  );
}

function DeleteSubmit() {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" variant="ghost" size="sm" disabled={pending} className="text-red-600 hover:text-red-600 dark:text-red-400">
      {pending ? <Loader2 className="size-4 animate-spin" /> : <Trash2 className="size-4" />}
      Delete source
    </Button>
  );
}
