"use client";

import { useState, useTransition } from "react";
import { Forward, Loader2 } from "lucide-react";
import { forwardComment, type ForwardState } from "@/lib/actions/tickets";
import { sanitizeCommentHtml } from "@/lib/markdown";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";

/**
 * Per-message Forward (Freshservice-style). Hover a message → forward it to an
 * external party with To/Cc + your note; the quoted message is included. Their
 * reply comes back as a private internal note.
 */
export function ForwardMessageDialog({
  ticketId,
  comment,
}: {
  ticketId: number;
  comment: { id: string; author: string; bodyHtml: string | null; body: string };
}) {
  const [open, setOpen] = useState(false);
  const [state, setState] = useState<ForwardState>();
  const [pending, start] = useTransition();

  const submit = (fd: FormData) => {
    start(async () => {
      const res = await forwardComment(undefined, fd);
      setState(res);
      if (res?.ok) { setOpen(false); setState(undefined); }
    });
  };

  const preview = comment.bodyHtml
    ? sanitizeCommentHtml(comment.bodyHtml)
    : `<p>${comment.body.replace(/&/g, "&amp;").replace(/</g, "&lt;")}</p>`;

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="inline-flex items-center gap-1 rounded px-1.5 py-0.5 text-xs text-muted-foreground hover:text-foreground"
        title="Forward this message"
      >
        <Forward className="size-3.5" /> Forward
      </button>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>Forward message</DialogTitle>
            <DialogDescription>
              Send to an external party. The public conversation from this message onward is included; their reply comes back as an internal note — the requester never sees it.
            </DialogDescription>
          </DialogHeader>
          <form action={submit} className="grid gap-3">
            <input type="hidden" name="ticketId" value={ticketId} />
            <input type="hidden" name="commentId" value={comment.id} />
            {state?.error ? (
              <p className="rounded-lg border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive">{state.error}</p>
            ) : null}
            <div className="grid gap-1.5">
              <Label htmlFor="fwd-to">To</Label>
              <Input id="fwd-to" name="to" type="email" placeholder="vendor@example.com" required />
            </div>
            <div className="grid gap-1.5">
              <Label htmlFor="fwd-cc">Cc (optional, comma-separated)</Label>
              <Input id="fwd-cc" name="cc" placeholder="chef@example.com, kollege@example.com" />
            </div>
            <Textarea name="note" placeholder="Add a message…" className="min-h-20" />
            <div className="rounded-lg border bg-muted/30 p-2.5">
              <div className="mb-1 text-xs font-medium text-muted-foreground">Conversation from this message · {comment.author}</div>
              <div
                className="prose prose-sm dark:prose-invert max-h-40 max-w-none overflow-auto text-muted-foreground"
                dangerouslySetInnerHTML={{ __html: preview }}
              />
            </div>
            <DialogFooter>
              <Button type="submit" disabled={pending}>
                {pending ? <Loader2 className="size-4 animate-spin" /> : <Forward className="size-4" />}
                Forward
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </>
  );
}
