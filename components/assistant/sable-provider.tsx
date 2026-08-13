"use client";

import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import { usePathname } from "next/navigation";
import type { AssistantScope } from "@/lib/actions/ai-assistant";

/**
 * The global Sable window state machine. Mounted ONCE in the console layout
 * (above the page) so the window — and the active conversation — survive
 * client-side navigation. Three visual states:
 *
 *  - `closed`  → nothing on screen but the floating action button (FAB).
 *  - `min`     → a small floating chat card (the *current* conversation).
 *  - `max`     → a large centered "window" with the conversation-history rail.
 *
 * `min` and `max` render the SAME conversation (shared `conversationId`), so
 * expanding/minimising never loses context, and every chat is persisted and
 * reachable from the history rail in the maximised window.
 */

export type SableState = "closed" | "min" | "max";
export type SableOpenState = "min" | "max";

const LS_STATE = "sable:lastOpen";
const LS_CONV = "sable:conversationId";

function readLS(key: string): string | null {
  if (typeof window === "undefined") return null;
  try {
    return window.localStorage.getItem(key);
  } catch {
    return null;
  }
}
function writeLS(key: string, value: string | null) {
  if (typeof window === "undefined") return;
  try {
    if (value === null) window.localStorage.removeItem(key);
    else window.localStorage.setItem(key, value);
  } catch {
    /* ignore (private mode / quota) */
  }
}

export type SableContextValue = {
  state: SableState;
  /** The active conversation id (null = a fresh, not-yet-created chat). */
  conversationId: string | null;
  scope: AssistantScope;
  /** In-context surface for the next turn (e.g. the ticket the user opened Sable from). */
  context?: { ticketId?: number };
  /** Open the window in a given state; optionally point it at a conversation/scope/context. */
  open: (
    state: Exclude<SableState, "closed">,
    opts?: { conversationId?: string | null; scope?: AssistantScope; context?: { ticketId?: number } },
  ) => void;
  /** Re-open in whatever state (min/max) it was last left in. */
  openLast: () => void;
  minimize: () => void;
  maximize: () => void;
  close: () => void;
  /** Start a brand-new (empty) chat in the current scope. */
  newChat: () => void;
  /** Point the window at an existing conversation (from the rail). */
  setConversation: (id: string | null) => void;
  setScope: (scope: AssistantScope) => void;
};

const SableCtx = createContext<SableContextValue | null>(null);

export function useSable(): SableContextValue {
  const ctx = useContext(SableCtx);
  if (!ctx) throw new Error("useSable must be used within <SableProvider>");
  return ctx;
}

export function SableProvider({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const [state, setState] = useState<SableState>("closed");
  // Restore the last conversation + open state from a previous session.
  const [conversationId, setConversationId] = useState<string | null>(() => readLS(LS_CONV) || null);
  const [lastOpen, setLastOpen] = useState<SableOpenState>(
    () => (readLS(LS_STATE) === "max" ? "max" : "min"),
  );
  const [scope, setScope] = useState<AssistantScope>("GENERAL");
  const [contextOverride, setContextOverride] = useState<{ ticketId?: number } | undefined>(undefined);

  // Ticket context derived from the URL, e.g. /tickets/123 (not the list).
  const pathTicketId = useMemo(() => {
    const m = pathname?.match(/\/tickets\/(\d+)(?:$|[/?#])/);
    return m ? Number(m[1]) : undefined;
  }, [pathname]);

  // An explicit context (from a "Sable" link) wins; otherwise use the current page's ticket.
  const context = useMemo<{ ticketId?: number } | undefined>(() => {
    if (contextOverride) return contextOverride;
    return pathTicketId ? { ticketId: pathTicketId } : undefined;
  }, [contextOverride, pathTicketId]);

  const open = useCallback<SableContextValue["open"]>((next, opts) => {
    if (opts && "conversationId" in opts) {
      setConversationId(opts.conversationId ?? null);
      writeLS(LS_CONV, opts.conversationId ?? null);
    }
    if (opts?.scope) setScope(opts.scope);
    if (opts && "context" in opts) setContextOverride(opts.context);
    setState(next);
    setLastOpen(next);
    writeLS(LS_STATE, next);
  }, []);

  const openLast = useCallback(() => {
    setState(lastOpen);
  }, [lastOpen]);

  const minimize = useCallback(() => {
    setState("min");
    setLastOpen("min");
    writeLS(LS_STATE, "min");
  }, []);
  const maximize = useCallback(() => {
    setState("max");
    setLastOpen("max");
    writeLS(LS_STATE, "max");
  }, []);
  const close = useCallback(() => setState("closed"), []);

  const newChat = useCallback(() => {
    setConversationId(null);
    setContextOverride(undefined);
    writeLS(LS_CONV, null);
  }, []);

  const setConversation = useCallback((id: string | null) => {
    setConversationId(id);
    writeLS(LS_CONV, id);
  }, []);

  const value = useMemo<SableContextValue>(
    () => ({
      state,
      conversationId,
      scope,
      context,
      open,
      openLast,
      minimize,
      maximize,
      close,
      newChat,
      setConversation,
      setScope,
    }),
    [state, conversationId, scope, context, open, openLast, minimize, maximize, close, newChat, setConversation],
  );

  return <SableCtx.Provider value={value}>{children}</SableCtx.Provider>;
}
