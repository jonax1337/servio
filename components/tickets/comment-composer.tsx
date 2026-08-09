"use client";

import { useRef } from "react";
import { useFormStatus } from "react-dom";
import { Send, Loader2 } from "lucide-react";
import { addTicketComment } from "@/lib/actions/tickets";
import { Button } from "@/components/ui/button";
import { RichTextEditor } from "@/components/ui/rich-text-editor";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";

function SubmitButton() {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" size="sm" disabled={pending}>
      {pending ? <Loader2 className="size-4 animate-spin" /> : <Send className="size-4" />}
      Send
    </Button>
  );
}

export function CommentComposer({ ticketId }: { ticketId: number }) {
  const ref = useRef<HTMLFormElement>(null);
  return (
    <form
      ref={ref}
      action={async (fd) => {
        await addTicketComment(fd);
        ref.current?.reset();
      }}
      className="grid gap-2 rounded-xl border bg-card p-3"
    >
      <input type="hidden" name="ticketId" value={ticketId} />
      <RichTextEditor name="bodyHtml" required ariaLabel="Reply" placeholder="Write a reply or add an internal note…" />
      <div className="flex items-center justify-between border-t pt-2">
        <div className="flex items-center gap-2">
          <Checkbox id="isInternal" name="isInternal" />
          <Label htmlFor="isInternal" className="text-xs text-muted-foreground">
            Internal note (not visible to requester)
          </Label>
        </div>
        <SubmitButton />
      </div>
    </form>
  );
}
