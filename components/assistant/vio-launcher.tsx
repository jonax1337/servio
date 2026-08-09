"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { usePathname } from "next/navigation";
import { Sparkles, Plus, X } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Sheet, SheetContent } from "@/components/ui/sheet";
import { ChatPanel } from "./chat-panel";
import { createConversation } from "@/lib/actions/ai-assistant";
import { AI_ASSISTANT_NAME } from "@/lib/constants";

const GENERAL_SUGGESTIONS = [
  "Any similar past tickets for this issue?",
  "Search the knowledge base for VPN setup",
  "Draft a ticket for a broken printer",
];
const TICKET_SUGGESTIONS = [
  "Summarize this ticket",
  "Draft a KB article from this ticket",
  "What should I do next on this ticket?",
];

/**
 * The ONE Vio entry point, mounted in the topbar so the exact same assistant is
 * reachable from every page — as a right-hand side sheet (a compact version of
 * the /assistant chat, same engine: subscription backend, operation registry,
 * approval cards). On a ticket page it auto-detects the ticket from the URL and
 * passes it as context, so "summarise this ticket" / "draft a KB article from
 * this ticket" / "tag it" work with no ref typing.
 */
export function VioLauncher() {
  const pathname = usePathname();
  const [open, setOpen] = useState(false);
  const [sessionKey, setSessionKey] = useState(0); // bump → fresh chat (remount)
  const [convId, setConvId] = useState<string | null>(null);

  // Detect a ticket context from the URL, e.g. /tickets/123 (not the list).
  const ticketId = useMemo(() => {
    const m = pathname?.match(/\/tickets\/(\d+)(?:$|[/?#])/);
    return m ? Number(m[1]) : undefined;
  }, [pathname]);

  // Starting a chat about a different surface should begin fresh.
  useEffect(() => {
    setConvId(null);
    setSessionKey((k) => k + 1);
  }, [ticketId]);

  const context = ticketId ? { ticketId } : undefined;
  const suggestions = ticketId ? TICKET_SUGGESTIONS : GENERAL_SUGGESTIONS;

  const ensureConversation = useCallback(async () => {
    const res = await createConversation("GENERAL");
    if (!res.ok) {
      toast.error(res.error ?? "Could not start a chat");
      return null;
    }
    setConvId(res.conversation.id);
    return res.conversation.id;
  }, []);

  const newChat = useCallback(() => {
    setConvId(null);
    setSessionKey((k) => k + 1);
  }, []);

  return (
    <Sheet open={open} onOpenChange={setOpen}>
      <Button
        type="button"
        variant="ghost"
        size="icon"
        aria-label={`Open ${AI_ASSISTANT_NAME}`}
        onClick={() => setOpen(true)}
        className="text-violet-600 hover:text-violet-700 dark:text-violet-300 dark:hover:text-violet-200"
      >
        <Sparkles className="size-4" />
      </Button>

      <SheetContent
        side="right"
        showCloseButton={false}
        className="flex w-full flex-col gap-0 p-0 sm:max-w-md"
      >
        <header className="flex items-center gap-2.5 border-b bg-gradient-to-r from-violet-500/10 to-fuchsia-500/10 px-3 py-2.5">
          <span className="grid size-8 shrink-0 place-items-center rounded-full bg-gradient-to-br from-violet-500 to-fuchsia-500 text-white shadow-sm shadow-violet-500/30">
            <Sparkles className="size-4" />
          </span>
          <div className="min-w-0">
            <div className="text-sm font-semibold leading-tight">{AI_ASSISTANT_NAME}</div>
            <div className="truncate text-[11px] text-muted-foreground">
              {ticketId ? `Helping with ticket #${ticketId}` : "Your service desk copilot"}
            </div>
          </div>
          <div className="ml-auto flex items-center gap-0.5">
            <Button
              type="button"
              variant="ghost"
              size="icon-sm"
              onClick={newChat}
              aria-label="New chat"
            >
              <Plus className="size-4" />
            </Button>
            <Button
              type="button"
              variant="ghost"
              size="icon-sm"
              onClick={() => setOpen(false)}
              aria-label="Close"
            >
              <X className="size-4" />
            </Button>
          </div>
        </header>

        <div className="flex min-h-0 flex-1 flex-col">
          <ChatPanel
            key={`vio-${ticketId ?? "global"}-${sessionKey}`}
            conversationId={convId}
            scope="GENERAL"
            ensureConversation={ensureConversation}
            context={context}
            suggestions={suggestions}
          />
        </div>
      </SheetContent>
    </Sheet>
  );
}
