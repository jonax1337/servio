"use client";

import { useActionState } from "react";
import { Loader2, Plus } from "lucide-react";
import { createCategory, type ActionState } from "@/lib/actions/categories";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { ComboField } from "@/components/combo-field";
import type { ComboOption } from "@/components/combobox";

export type ParentOption = { id: string; name: string };
export type TeamOption = { id: string; name: string };

function Field({
  label, error, children, hint,
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

export function CategoryForm({ parents, teams }: { parents: ParentOption[]; teams: TeamOption[] }) {
  const [state, action, pending] = useActionState<ActionState, FormData>(
    createCategory,
    undefined,
  );
  const fe = state?.fieldErrors ?? {};
  const parentOpts: ComboOption[] = parents.map((p) => ({ value: p.id, label: p.name }));
  const teamOpts: ComboOption[] = teams.map((t) => ({ value: t.id, label: t.name }));

  return (
    <form action={action} className="grid gap-5">
      {state?.error ? (
        <p className="rounded-lg border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive">
          {state.error}
        </p>
      ) : null}

      <Field label="Name" error={fe.name}>
        <Input name="name" placeholder="e.g. Network, Laptop, Access" required />
      </Field>

      <div className="grid gap-5 sm:grid-cols-2">
        <Field
          label="Parent category"
          error={fe.parentId}
          hint="Nest under an existing category, or leave as a top-level category."
        >
          <ComboField name="parentId" options={parentOpts} includeNone noneLabel="— Top level —" />
        </Field>

        <Field label="Color" error={fe.color} hint="Hex color for the category dot.">
          <Input name="color" defaultValue="#64748b" placeholder="#64748b" />
        </Field>
      </div>

      <Field
        label="Handled by (team)"
        error={fe.groupId}
        hint="Optional. Recorded so Vio knows who owns this category — it does not auto-route tickets."
      >
        <ComboField name="groupId" options={teamOpts} includeNone noneLabel="— No team —" />
      </Field>

      <Field label="Description" error={fe.description}>
        <Textarea
          name="description"
          placeholder="Optional context describing when to use this category…"
          className="min-h-24"
        />
      </Field>

      <div className="flex items-center justify-end gap-2 border-t pt-4">
        <Button type="submit" disabled={pending}>
          {pending ? <Loader2 className="size-4 animate-spin" /> : <Plus className="size-4" />}
          Create category
        </Button>
      </div>
    </form>
  );
}
