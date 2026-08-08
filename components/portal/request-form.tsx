"use client";

import { useActionState } from "react";
import { Loader2, Send } from "lucide-react";
import { createPortalTicket, type PortalState } from "@/lib/actions/portal";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
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

  return (
    <form action={action} className="grid gap-5">
      {state?.error ? (
        <p className="rounded-lg border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive">
          {state.error}
        </p>
      ) : null}

      <div className="grid gap-1.5">
        <Label>What do you need?</Label>
        <Select
          name="type"
          defaultValue={TICKET_TYPES.includes(defaultType as (typeof TICKET_TYPES)[number]) ? defaultType : "INCIDENT"}
          items={Object.fromEntries(TICKET_TYPES.map((t) => [t, TICKET_TYPE_META[t].label]))}
        >
          <SelectTrigger className="w-full"><SelectValue /></SelectTrigger>
          <SelectContent>
            {TICKET_TYPES.map((t) => (
              <SelectItem key={t} value={t}>{TICKET_TYPE_META[t].label}</SelectItem>
            ))}
          </SelectContent>
        </Select>
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
          <Select name="priority" defaultValue="MEDIUM" items={Object.fromEntries(PRIORITIES.map((p) => [p, PRIORITY_META[p].label]))}>
            <SelectTrigger className="w-full"><SelectValue /></SelectTrigger>
            <SelectContent>
              {PRIORITIES.map((p) => <SelectItem key={p} value={p}>{PRIORITY_META[p].label}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>

        <div className="grid gap-1.5">
          <Label>Related service (optional)</Label>
          <Select name="serviceId" defaultValue={defaultService ?? "none"} items={{ none: "— None —", ...Object.fromEntries(services.map((s) => [s.value, s.label])) }}>
            <SelectTrigger className="w-full"><SelectValue placeholder="Choose a service" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="none">— None —</SelectItem>
              {services.map((s) => <SelectItem key={s.value} value={s.value}>{s.label}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>

        <div className="grid gap-1.5 sm:col-span-2">
          <Label>Category (optional)</Label>
          <Select name="categoryId" defaultValue="none" items={{ none: "— None —", ...Object.fromEntries(categories.map((c) => [c.value, c.label])) }}>
            <SelectTrigger className="w-full"><SelectValue placeholder="Choose a category" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="none">— None —</SelectItem>
              {categories.map((c) => <SelectItem key={c.value} value={c.value}>{c.label}</SelectItem>)}
            </SelectContent>
          </Select>
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
