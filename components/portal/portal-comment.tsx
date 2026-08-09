"use client";

import { useRef } from "react";
import { useFormStatus } from "react-dom";
import { Send, Loader2 } from "lucide-react";
import { addPortalComment } from "@/lib/actions/portal";
import { Button } from "@/components/ui/button";
import { RichTextEditor } from "@/components/ui/rich-text-editor";
import { ComposerAttachments } from "@/components/comments/composer-attachments";

function SubmitButton() {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" size="sm" disabled={pending}>
      {pending ? <Loader2 className="size-4 animate-spin" /> : <Send className="size-4" />}
      Send reply
    </Button>
  );
}

export function PortalComment({ ticketId }: { ticketId: number }) {
  const ref = useRef<HTMLFormElement>(null);
  return (
    <form
      ref={ref}
      action={async (fd) => {
        await addPortalComment(fd);
        ref.current?.reset();
      }}
      className="grid gap-2 rounded-xl border bg-card p-3"
    >
      <input type="hidden" name="ticketId" value={ticketId} />
      <RichTextEditor name="bodyHtml" required ariaLabel="Reply" placeholder="Add more details or reply to the agent…" />
      <ComposerAttachments ticketId={ticketId} />
      <div className="flex justify-end border-t pt-2">
        <SubmitButton />
      </div>
    </form>
  );
}
