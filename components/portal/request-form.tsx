"use client";

import { useActionState } from "react";
import { Loader2, Send } from "lucide-react";
import { createPortalTicket, type PortalState } from "@/lib/actions/portal";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { ComboField } from "@/components/combo-field";
import type { ComboOption } from "@/components/combobox";
import { TICKET_TYPES, PRIORITIES, TICKET_TYPE_META, PRIORITY_META } from "@/lib/constants";

type Opt = { value: string; label: string };

export function RequestForm({
  categories, services, defaultType, defaultService,
}: {
  categories: Opt[];
  services: Opt[];
  defaultType: string;
  defaultService?: string;
}) {
  const [state, action, pending] = useActionState<PortalState, FormData>(createPortalTicket, undefined);
  const fe = state?.fieldErrors ?? {};

  const typeOpts: ComboOption[] = TICKET_TYPES.map((t) => ({
    value: t,
    label: TICKET_TYPE_META[t].label,
    tone: TICKET_TYPE_META[t].tone,
    icon: TICKET_TYPE_META[t].icon,
  }));
  const priorityOpts: ComboOption[] = PRIORITIES.map((p) => ({
    value: p,
    label: PRIORITY_META[p].label,
    tone: PRIORITY_META[p].tone,
    icon: PRIORITY_META[p].icon,
  }));
  const defaultTypeValue = TICKET_TYPES.includes(defaultType as (typeof TICKET_TYPES)[number])
    ? defaultType
    : "INCIDENT";

  return (
    <form action={action} className="grid gap-5">
      {state?.error ? (
        <p className="rounded-lg border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive">
          {state.error}
        </p>
      ) : null}

      <div className="grid gap-1.5">
        <Label>What do you need?</Label>
        <ComboField name="type" options={typeOpts} defaultValue={defaultTypeValue} />
      </div>

      <div className="grid gap-1.5">
        <Label>Subject</Label>
        <Input name="title" placeholder="Briefly, what is this about?" required />
        {fe.title ? <p className="text-xs text-destructive">{fe.title[0]}</p> : null}
      </div>

      <div className="grid gap-1.5">
        <Label>Details</Label>
        <Textarea name="description" placeholder="Tell us what happened, any error messages, and when it started…" className="min-h-32" />
      </div>

      <div className="grid gap-5 sm:grid-cols-2">
        <div className="grid gap-1.5">
          <Label>Priority</Label>
          <ComboField name="priority" options={priorityOpts} defaultValue="MEDIUM" />
        </div>

        <div className="grid gap-1.5">
          <Label>Related service (optional)</Label>
          <ComboField name="serviceId" options={services} defaultValue={defaultService ?? "none"} includeNone />
        </div>

        <div className="grid gap-1.5 sm:col-span-2">
          <Label>Category (optional)</Label>
          <ComboField name="categoryId" options={categories} defaultValue="none" includeNone />
        </div>
      </div>

      <div className="flex justify-end border-t pt-4">
        <Button type="submit" size="lg" disabled={pending}>
          {pending ? <Loader2 className="size-4 animate-spin" /> : <Send className="size-4" />}
          Submit request
        </Button>
      </div>
    </form>
  );
}
