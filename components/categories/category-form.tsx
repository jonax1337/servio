"use client";

import { useActionState } from "react";
import { Loader2, Plus } from "lucide-react";
import { createCategory, type ActionState } from "@/lib/actions/categories";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { CATEGORY_TYPES } from "@/lib/constants";

const TYPE_LABELS: Record<(typeof CATEGORY_TYPES)[number], string> = {
  INCIDENT: "Incident",
  REQUEST: "Service Request",
  PROBLEM: "Problem",
  CHANGE: "Change",
  ASSET: "Asset",
};

export type ParentOption = { id: string; name: string; type: string };

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

export function CategoryForm({ parents }: { parents: ParentOption[] }) {
  const [state, action, pending] = useActionState<ActionState, FormData>(
    createCategory,
    undefined,
  );
  const fe = state?.fieldErrors ?? {};

  const typeItems = Object.fromEntries(
    CATEGORY_TYPES.map((t) => [t, TYPE_LABELS[t]]),
  );
  const parentItems = {
    none: "— None (top level) —",
    ...Object.fromEntries(
      parents.map((p) => [p.id, `${p.name} · ${TYPE_LABELS[p.type as keyof typeof TYPE_LABELS] ?? p.type}`]),
    ),
  };

  return (
    <form action={action} className="grid gap-5">
      {state?.error ? (
        <p className="rounded-lg border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive">
          {state.error}
        </p>
      ) : null}

      <Field label="Name" error={fe.name}>
        <Input name="name" placeholder="e.g. Network, Access Request, Hardware" required />
      </Field>

      <div className="grid gap-5 sm:grid-cols-2">
        <Field label="Type" error={fe.type}>
          <Select name="type" defaultValue="INCIDENT" items={typeItems}>
            <SelectTrigger className="w-full">
              <SelectValue placeholder="Type" />
            </SelectTrigger>
            <SelectContent>
              {CATEGORY_TYPES.map((t) => (
                <SelectItem key={t} value={t}>
                  {TYPE_LABELS[t]}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </Field>

        <Field
          label="Parent category"
          error={fe.parentId}
          hint="Nest this under an existing category, or leave as top level."
        >
          <Select name="parentId" defaultValue="none" items={parentItems}>
            <SelectTrigger className="w-full">
              <SelectValue placeholder="— None (top level) —" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="none">— None (top level) —</SelectItem>
              {parents.map((p) => (
                <SelectItem key={p.id} value={p.id}>
                  {p.name} · {TYPE_LABELS[p.type as keyof typeof TYPE_LABELS] ?? p.type}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </Field>
      </div>

      <Field
        label="Color"
        error={fe.color}
        hint="Hex color used for the category dot, e.g. #64748b."
      >
        <Input name="color" defaultValue="#64748b" placeholder="#64748b" />
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
          {pending ? (
            <Loader2 className="size-4 animate-spin" />
          ) : (
            <Plus className="size-4" />
          )}
          Create category
        </Button>
      </div>
    </form>
  );
}
