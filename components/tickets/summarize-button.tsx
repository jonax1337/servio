"use client";

import { useState, useTransition } from "react";
import { Sparkles, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { AiButton } from "@/components/ui/ai-button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { summarizeThread } from "@/lib/actions/ai";
import { AI_TEASER_MESSAGE } from "@/lib/constants";

/** "Summarize thread" — opens a dialog and renders an AI summary of the ticket. */
export function SummarizeButton({ ticketId, teaser = false }: { ticketId: number; teaser?: boolean }) {
  const [pending, start] = useTransition();
  const [summary, setSummary] = useState<string | null>(null);
  const [open, setOpen] = useState(false);

  function run() {
    if (teaser) return void toast.info(AI_TEASER_MESSAGE);
    setOpen(true);
    setSummary(null);
    start(async () => {
      const res = await summarizeThread(ticketId);
      if (!res.ok) {
        setOpen(false);
        return void toast.error(res.error);
      }
      setSummary(res.text);
    });
  }

  return (
    <>
      <AiButton onClick={run} disabled={pending}>
        {pending ? <Loader2 className="size-4 animate-spin" /> : <Sparkles className="size-4" />}
        Summarize
      </AiButton>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Sparkles className="size-4" /> AI Summary
            </DialogTitle>
            <DialogDescription>Generated from the ticket and its discussion.</DialogDescription>
          </DialogHeader>
          {pending ? (
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              <Loader2 className="size-4 animate-spin" /> Summarising…
            </div>
          ) : (
            <p className="whitespace-pre-wrap text-sm leading-relaxed">{summary}</p>
          )}
        </DialogContent>
      </Dialog>
    </>
  );
}
