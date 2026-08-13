"use client";

import { useCallback, useState } from "react";
import { Plus, X, Minus, Maximize2 } from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { AI_ASSISTANT_NAME } from "@/lib/constants";
import { useSable } from "./sable-provider";
import { SableThread } from "./sable-thread";
import { SableRail } from "./sable-rail";
import { SableHeader, SABLE_MIN_SIZE } from "./sable-chrome";

/**
 * The global Sable window. A SINGLE persistent chat is kept mounted across the
 * min ↔ max transition (so an in-flight stream is never lost); only the framing
 * changes. The maximised state adds the conversation-history rail.
 *
 * `variant="inline"` renders the two-pane surface full-size with no overlay
 * (used by the /assistant route so the sidebar item stays deep-linkable),
 * sharing the same provider state as the overlay.
 */
export function SableWindow({
  isAdmin = false,
  disabled = false,
  teaser = false,
  variant = "overlay",
}: {
  isAdmin?: boolean;
  disabled?: boolean;
  teaser?: boolean;
  variant?: "overlay" | "inline";
}) {
  const sable = useSable();
  const inline = variant === "inline";
  const state = inline ? "max" : sable.state;

  // A selection nonce keys <SableThread>: it changes ONLY on explicit selection or
  // new-chat, never when a fresh chat auto-creates its id — so the live stream
  // survives min↔max and id assignment without a remount.
  const [selected, setSelected] = useState<{ id: string | null; nonce: number }>({
    id: sable.conversationId,
    nonce: 0,
  });
  // Bumped to make the rail refetch (after a turn / new chat / creation).
  const [refreshKey, setRefreshKey] = useState(0);
  // Drives the exit animation: on close we keep the panel mounted for a beat so
  // it can animate out, then actually close. Event-handler driven (no effect).
  const [closing, setClosing] = useState(false);

  const handleClose = useCallback(() => {
    setClosing(true);
    window.setTimeout(() => {
      setClosing(false);
      sable.close();
    }, 160);
  }, [sable]);

  // Bridge external conversation changes (e.g. a "Sable" link that opens a saved
  // chat) into a remount — but NOT when a fresh chat self-assigns its id (that
  // must keep the in-flight stream). Done during render (React's recommended
  // "adjust state when a prop changes" pattern) rather than in an effect.
  const [lastExternalId, setLastExternalId] = useState<string | null>(sable.conversationId);
  if (sable.conversationId !== lastExternalId) {
    setLastExternalId(sable.conversationId);
    setSelected((s) =>
      sable.conversationId === s.id ? s : { id: sable.conversationId, nonce: s.nonce + 1 },
    );
  }

  const refresh = useCallback(() => setRefreshKey((k) => k + 1), []);

  const visible = inline || state !== "closed";

  const selectConversation = useCallback(
    (id: string | null) => {
      setSelected((s) => ({ id, nonce: s.nonce + 1 }));
      sable.setConversation(id);
    },
    [sable],
  );

  const onNewChat = useCallback(() => {
    setSelected((s) => ({ id: null, nonce: s.nonce + 1 }));
    sable.newChat();
  }, [sable]);

  const onConversationCreated = useCallback(
    (id: string) => {
      // Adopt the new id WITHOUT bumping the nonce (no remount), then refresh the rail.
      setSelected((s) => ({ id, nonce: s.nonce }));
      sable.setConversation(id);
      void refresh();
    },
    [sable, refresh],
  );

  if (!visible) return null;

  const scope = sable.scope;

  const chat = disabled ? null : (
    <SableThread
      key={selected.nonce}
      conversationId={selected.id}
      scope={scope}
      context={sable.context}
      onConversationCreated={onConversationCreated}
      onActivity={refresh}
    />
  );

  const header = (
    <SableHeader
      subtitle={sable.context?.ticketId ? `Helping with ticket #${sable.context.ticketId}` : undefined}
    >
      <Button type="button" variant="ghost" size="icon-sm" onClick={onNewChat} aria-label="New chat">
        <Plus className="size-4" />
      </Button>
      {!inline && state === "min" ? (
        <Button type="button" variant="ghost" size="icon-sm" onClick={sable.maximize} aria-label="Expand">
          <Maximize2 className="size-4" />
        </Button>
      ) : null}
      {!inline && state === "max" ? (
        <Button type="button" variant="ghost" size="icon-sm" onClick={sable.minimize} aria-label="Minimize">
          <Minus className="size-4" />
        </Button>
      ) : null}
      {!inline ? (
        <Button type="button" variant="ghost" size="icon-sm" onClick={handleClose} aria-label="Close">
          <X className="size-4" />
        </Button>
      ) : null}
    </SableHeader>
  );

  const rail =
    state === "max" ? (
      <aside className="hidden w-72 shrink-0 flex-col border-r bg-muted/20 md:flex">
        <SableRail
          activeId={selected.id}
          onSelect={selectConversation}
          onNewChat={onNewChat}
          refreshKey={refreshKey}
          isAdmin={isAdmin}
          scope={scope}
          onScope={(s) => {
            sable.setScope(s);
            onNewChat();
          }}
        />
      </aside>
    ) : null;

  const panelBody = (
    <div className="flex min-h-0 flex-1 overflow-hidden">
      {rail}
      <div className="flex min-h-0 min-w-0 flex-1 flex-col">
        {disabled ? (
          <div className="border-b bg-amber-500/10 px-3 py-2 text-center text-xs text-amber-700 dark:text-amber-300">
            {teaser
              ? `${AI_ASSISTANT_NAME} is a preview here — ask your admin to enable AI to use it.`
              : `${AI_ASSISTANT_NAME} is not enabled. Ask your admin to configure AI.`}
          </div>
        ) : null}
        {chat}
      </div>
    </div>
  );

  if (inline) {
    return (
      <div className="flex h-full min-h-0 flex-col overflow-hidden rounded-xl border bg-background shadow-sm">
        {header}
        {panelBody}
      </div>
    );
  }

  const showBackdrop = state === "max" && !closing;

  return (
    // Full-screen, corner-anchored stage. Clicks pass through to the page in the
    // minimised (non-modal) state; the max backdrop captures them → minimise.
    <div className="pointer-events-none fixed inset-0 z-50 flex items-end justify-end p-4">
      <div
        aria-hidden
        onClick={sable.minimize}
        className={cn(
          "absolute inset-0 bg-black/40 backdrop-blur-sm transition-opacity duration-200",
          showBackdrop ? "pointer-events-auto opacity-100" : "pointer-events-none opacity-0",
        )}
      />
      <div
        role="dialog"
        aria-modal={state === "max"}
        aria-label={AI_ASSISTANT_NAME}
        className={cn(
          "pointer-events-auto relative flex flex-col overflow-hidden rounded-xl border bg-background shadow-2xl",
          // Size morph between min and max (same bottom-right anchor).
          "transition-[width,height] duration-300 ease-[cubic-bezier(0.22,1,0.36,1)]",
          state === "max"
            ? "h-[calc(100vh-2rem)] w-[min(1500px,calc(100vw-2rem))]"
            : SABLE_MIN_SIZE,
          // Enter on mount / exit on close.
          closing
            ? "duration-150 animate-out fade-out-0 zoom-out-95 slide-out-to-bottom-4"
            : "duration-200 animate-in fade-in-0 zoom-in-95 slide-in-from-bottom-4",
        )}
      >
        {header}
        {panelBody}
      </div>
    </div>
  );
}
