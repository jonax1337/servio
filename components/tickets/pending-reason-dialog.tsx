"use client";

import { useState } from "react";
import { setTicketPending } from "@/lib/actions/tickets";
import { PENDING_REASONS, PENDING_REASON_META } from "@/lib/constants";
import { Combobox, type ComboOption } from "@/components/combobox";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";

export function PendingReasonDialog({
  ticketId, status, open, onOpenChange,
}: {
  ticketId: number;
  status: string;
  open: boolean;
  onOpenChange: (o: boolean) => void;
}) {
  const [reason, setReason] = useState<string>(PENDING_REASONS[0]);
  const opts: ComboOption[] = PENDING_REASONS.map((r) => ({
    value: r, label: PENDING_REASON_META[r].label, tone: PENDING_REASON_META[r].tone, icon: PENDING_REASON_META[r].icon,
  }));

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{status === "ON_HOLD" ? "Put ticket on hold" : "Set ticket to pending"}</DialogTitle>
          <DialogDescription>Tell us what this ticket is waiting on.</DialogDescription>
        </DialogHeader>
        <form action={async (fd) => { await setTicketPending(fd); onOpenChange(false); }} className="grid gap-3">
          <input type="hidden" name="id" value={ticketId} />
          <input type="hidden" name="status" value={status} />
          <input type="hidden" name="reason" value={reason} />
          <div className="grid gap-1.5">
            <Label>Pending reason</Label>
            <Combobox options={opts} value={reason} onChange={setReason} />
          </div>
          <div className="grid gap-1.5">
            <Label>Note (optional)</Label>
            <Textarea name="note" placeholder="e.g. Waiting on the customer to confirm the fix…" className="min-h-20" />
          </div>
          <DialogFooter>
            <Button type="button" variant="ghost" onClick={() => onOpenChange(false)}>Cancel</Button>
            <Button type="submit">Confirm</Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
