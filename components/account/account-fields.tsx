"use client";

import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { ComboField } from "@/components/combo-field";
import type { ComboOption } from "@/components/combobox";
import { RichTextEditor } from "@/components/ui/rich-text-editor";

export type AccountUser = {
  name: string;
  email: string;
  phone: string;
  jobTitle: string;
  department: string;
  timezone: string;
  locale: string;
  signature: string;
  signatureEnabled: boolean;
};

export type FieldErrors = Record<string, string[] | undefined>;

export function Field({
  label,
  error,
  children,
  hint,
  htmlFor,
}: {
  label: string;
  error?: string[];
  children: React.ReactNode;
  hint?: string;
  htmlFor?: string;
}) {
  return (
    <div className="grid gap-1.5">
      <Label htmlFor={htmlFor}>{label}</Label>
      {children}
      {hint ? <p className="text-xs text-muted-foreground">{hint}</p> : null}
      {error ? <p className="text-xs text-destructive">{error[0]}</p> : null}
    </div>
  );
}

const TIMEZONES = [
  "UTC",
  "Europe/London",
  "Europe/Berlin",
  "Europe/Paris",
  "Europe/Madrid",
  "Europe/Warsaw",
  "America/New_York",
  "America/Chicago",
  "America/Denver",
  "America/Los_Angeles",
  "America/Sao_Paulo",
  "Asia/Dubai",
  "Asia/Kolkata",
  "Asia/Singapore",
  "Asia/Tokyo",
  "Australia/Sydney",
];

const LOCALES: ComboOption[] = [
  { value: "en", label: "English" },
  { value: "de", label: "Deutsch" },
  { value: "fr", label: "Français" },
  { value: "es", label: "Español" },
  { value: "it", label: "Italiano" },
  { value: "nl", label: "Nederlands" },
];

export function ProfileFields({
  user,
  fe,
}: {
  user: AccountUser;
  fe: FieldErrors;
}) {
  return (
    <div className="grid gap-5">
      <Field label="Name" error={fe.name} htmlFor="acc-name">
        <Input id="acc-name" name="name" defaultValue={user.name} required />
      </Field>

      <Field label="Email" hint="Managed by your identity provider.">
        <Input value={user.email} disabled readOnly />
      </Field>

      <div className="grid gap-5 sm:grid-cols-2">
        <Field label="Phone" error={fe.phone} htmlFor="acc-phone">
          <Input id="acc-phone" name="phone" defaultValue={user.phone} />
        </Field>
        <Field label="Job title" error={fe.jobTitle} htmlFor="acc-job">
          <Input id="acc-job" name="jobTitle" defaultValue={user.jobTitle} />
        </Field>
      </div>

      <Field label="Department" error={fe.department} htmlFor="acc-dept">
        <Input id="acc-dept" name="department" defaultValue={user.department} />
      </Field>
    </div>
  );
}

export function PreferencesFields({ user }: { user: AccountUser }) {
  const tzOpts: ComboOption[] = TIMEZONES.map((t) => ({ value: t, label: t }));
  const tzDefault = TIMEZONES.includes(user.timezone) ? user.timezone : "UTC";
  const localeDefault = LOCALES.some((l) => l.value === user.locale)
    ? user.locale
    : "en";

  return (
    <div className="grid gap-5 sm:grid-cols-2">
      <Field label="Timezone">
        <ComboField name="timezone" defaultValue={tzDefault} options={tzOpts} />
      </Field>
      <Field label="Language">
        <ComboField name="locale" defaultValue={localeDefault} options={LOCALES} />
      </Field>
    </div>
  );
}

export function SignatureFields({ user }: { user: AccountUser }) {
  return (
    <div className="grid gap-4">
      <label className="flex items-center justify-between gap-4">
        <span className="text-sm font-medium">Auto-append signature</span>
        <Switch name="signatureEnabled" defaultChecked={user.signatureEnabled} />
      </label>
      <RichTextEditor
        name="signature"
        defaultHTML={user.signature}
        ariaLabel="Email signature"
        placeholder="e.g. Jane Doe — IT Service Desk"
      />
      <p className="text-xs text-muted-foreground">
        Appended to your public ticket replies and outgoing emails when enabled.
      </p>
    </div>
  );
}
