"use client";

import { useState, useTransition } from "react";
import { Pencil, Loader2, Save } from "lucide-react";
import { updateService, type ActionState } from "@/lib/actions/services";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { IconPicker } from "@/components/icon-picker";
import {
  Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle, DialogTrigger,
} from "@/components/ui/dialog";

/** Edit a service's name + description. The other properties (status, owner,
 *  team, …) are edited inline via ServiceProperties. Server-side is agent-gated. */
export function ServiceEditDialog({
  service,
}: {
  service: { id: string; name: string; description: string | null; icon: string | null };
}) {
  const [open, setOpen] = useState(false);
  const [state, setState] = useState<ActionState>(undefined);
  const [pending, start] = useTransition();

  function onSubmit(fd: FormData) {
    start(async () => {
      const res = await updateService(undefined, fd);
      setState(res);
      if (!res?.error) setOpen(false);
    });
  }

  const fe = state?.fieldErrors ?? {};

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger render={<Button variant="outline" size="sm" />}>
        <Pencil className="size-4" /> Edit
      </DialogTrigger>
      <DialogContent className="sm:max-w-xl">
        <DialogHeader>
          <DialogTitle>Edit service</DialogTitle>
        </DialogHeader>
        <form action={onSubmit} className="grid gap-4">
          <input type="hidden" name="id" value={service.id} />
          {state?.error ? (
            <p className="rounded-lg border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive">
              {state.error}
            </p>
          ) : null}
          <div className="grid gap-1.5">
            <Label htmlFor="svc-name">Name</Label>
            <Input id="svc-name" name="name" defaultValue={service.name} required />
            {fe.name ? <p className="text-xs text-destructive">{fe.name[0]}</p> : null}
          </div>
          <div className="grid gap-1.5">
            <Label>Icon</Label>
            <IconPicker name="icon" defaultValue={service.icon ?? "LifeBuoy"} />
          </div>
          <div className="grid gap-1.5">
            <Label htmlFor="svc-desc">Description</Label>
            <Textarea
              id="svc-desc"
              name="description"
              defaultValue={service.description ?? ""}
              placeholder="What this service provides and who depends on it…"
              className="min-h-28"
            />
          </div>
          <DialogFooter>
            <Button type="submit" disabled={pending}>
              {pending ? <Loader2 className="size-4 animate-spin" /> : <Save className="size-4" />}
              Save changes
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
