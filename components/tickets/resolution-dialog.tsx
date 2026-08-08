"use client";

import { useState } from "react";
import { setTicketResolution } from "@/lib/actions/tickets";
import { RESOLUTION_CODES, RESOLUTION_CODE_META } from "@/lib/constants";
import { Combobox, type ComboOption } from "@/components/combobox";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";

export function ResolutionDialog({
  ticketId, status, open, onOpenChange,
}: {
  ticketId: number;
  status: string;
  open: boolean;
  onOpenChange: (o: boolean) => void;
}) {
  const isCancel = status === "CANCELLED";
  const [code, setCode] = useState<string>(RESOLUTION_CODES[0]);
  const codeOpts: ComboOption[] = RESOLUTION_CODES.map((c) => ({
    value: c, label: RESOLUTION_CODE_META[c].label, tone: RESOLUTION_CODE_META[c].tone, icon: RESOLUTION_CODE_META[c].icon,
  }));
  const title = isCancel ? "Cancel ticket" : status === "CLOSED" ? "Close ticket" : "Resolve ticket";

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          <DialogDescription>
            {isCancel ? "Add a short reason for cancelling this ticket." : "Record how this ticket was resolved so the requester knows what happened."}
          </DialogDescription>
        </DialogHeader>
        <form action={async (fd) => { await setTicketResolution(fd); onOpenChange(false); }} className="grid gap-3">
          <input type="hidden" name="id" value={ticketId} />
          <input type="hidden" name="status" value={status} />
          {!isCancel ? (
            <>
              <input type="hidden" name="code" value={code} />
              <div className="grid gap-1.5">
                <Label>Resolution code</Label>
                <Combobox options={codeOpts} value={code} onChange={setCode} />
              </div>
            </>
          ) : null}
          <div className="grid gap-1.5">
            <Label>{isCancel ? "Cancellation reason" : "Resolution note"}</Label>
            <Textarea name="note" required placeholder={isCancel ? "Why is this being cancelled?" : "What was done to resolve it?"} className="min-h-24" />
          </div>
          <DialogFooter>
            <Button type="button" variant="ghost" onClick={() => onOpenChange(false)}>Cancel</Button>
            <Button type="submit" variant={isCancel ? "destructive" : "default"}>
              {isCancel ? "Cancel ticket" : "Confirm"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
