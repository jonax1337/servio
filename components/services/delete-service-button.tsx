"use client";

import { useState, useTransition } from "react";
import { Trash2, Loader2 } from "lucide-react";
import { deleteService } from "@/lib/actions/services";
import { Button } from "@/components/ui/button";
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";

/** Delete a service behind a confirmation dialog. Server-side is agent-gated. */
export function DeleteServiceButton({ serviceId, serviceName }: { serviceId: string; serviceName: string }) {
  const [open, setOpen] = useState(false);
  const [pending, start] = useTransition();

  return (
    <>
      <Button
        type="button"
        variant="outline"
        size="icon-sm"
        aria-label="Delete service"
        title="Delete service"
        onClick={() => setOpen(true)}
        className="text-muted-foreground hover:border-destructive/40 hover:text-destructive"
      >
        <Trash2 className="size-4" />
      </Button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Delete service</DialogTitle>
            <DialogDescription>
              This permanently deletes <span className="font-medium text-foreground">{serviceName}</span>. Its
              catalog items and tickets are kept but unlinked from the service. This can&apos;t be undone.
            </DialogDescription>
          </DialogHeader>
          <form action={(fd) => start(async () => { await deleteService(fd); })}>
            <input type="hidden" name="id" value={serviceId} />
            <DialogFooter>
              <Button type="button" variant="ghost" onClick={() => setOpen(false)} disabled={pending}>
                Cancel
              </Button>
              <Button type="submit" variant="destructive" disabled={pending}>
                {pending ? <Loader2 className="size-4 animate-spin" /> : <Trash2 className="size-4" />}
                Delete service
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </>
  );
}
