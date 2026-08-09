"use client";

import { useState, useTransition } from "react";
import { Clock, Plus, Loader2 } from "lucide-react";
import { addWorkLog, type WorkLogState } from "@/lib/actions/tickets";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Popover, PopoverContent, PopoverHeader, PopoverTitle, PopoverTrigger,
} from "@/components/ui/popover";

export function LogTimePopover({ ticketId }: { ticketId: number }) {
  const [open, setOpen] = useState(false);
  const [state, setState] = useState<WorkLogState>(undefined);
  const [pending, startTransition] = useTransition();

  const submit = (formData: FormData) => {
    startTransition(async () => {
      const res = await addWorkLog(formData);
      setState(res);
      if (res?.ok) setOpen(false);
    });
  };

  return (
    <Popover open={open} onOpenChange={(o) => { if (!pending) setOpen(o); }}>
      <PopoverTrigger render={<Button variant="outline" size="sm" className="w-full" />}>
        <Plus className="size-3.5" /> Log time
      </PopoverTrigger>
      <PopoverContent align="end" className="w-72">
        <PopoverHeader>
          <PopoverTitle>Log time</PopoverTitle>
        </PopoverHeader>
        {state?.error ? (
          <p className="rounded-md border border-destructive/30 bg-destructive/10 px-2.5 py-1.5 text-xs text-destructive">
            {state.error}
          </p>
        ) : null}
        <form action={submit} className="grid gap-2.5">
          <input type="hidden" name="ticketId" value={ticketId} />
          <div className="grid gap-1.5">
            <label htmlFor="wl-minutes" className="text-xs font-medium text-muted-foreground">Minutes</label>
            <Input id="wl-minutes" name="minutes" type="number" min={1} step={1} placeholder="e.g. 30" required autoFocus />
          </div>
          <div className="grid gap-1.5">
            <label htmlFor="wl-note" className="text-xs font-medium text-muted-foreground">Note</label>
            <Input id="wl-note" name="note" placeholder="What did you work on?" />
          </div>
          <label className="flex items-center gap-2 text-xs text-muted-foreground">
            <input type="checkbox" name="billable" className="size-3.5 rounded border-input" /> Billable
          </label>
          <Button type="submit" size="sm" disabled={pending}>
            {pending ? <Loader2 className="size-3.5 animate-spin" /> : <Clock className="size-3.5" />}
            Log time
          </Button>
        </form>
      </PopoverContent>
    </Popover>
  );
}
