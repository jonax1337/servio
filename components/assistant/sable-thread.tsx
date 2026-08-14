"use client";
/* eslint-disable react-hooks/refs -- the conversation-id ref is read only inside
   the send-time transport callback (deferred), not during render. */

import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { Boxes, Loader2 } from "lucide-react";
import { AssistantRuntimeProvider } from "@assistant-ui/react";
import { useChatRuntime, AssistantChatTransport } from "@assistant-ui/react-ai-sdk";
import type { UIMessage } from "@ai-sdk/react";
import { Thread } from "@/components/thread";
import { SableToolUI, SableConversationContext } from "./sable-tool-ui";
import { useSableChatAdapters } from "./sable-adapters";
import {
  createConversation,
  getConversation,
  type AssistantProposal,
  type AssistantScope,
} from "@/lib/actions/ai-assistant";

const THREAD_COMPONENTS = { ToolFallback: SableToolUI };

// Tappable starter prompts shown on an empty chat. One unified set now that the
// GENERAL/ADMIN chat scope toggle is gone (admin ops surface in the normal chat,
// gated per-operation by the acting user's role).
const STARTER_SUGGESTIONS = [
  "What tickets are assigned to me?",
  "What should I pick up from my team's queue?",
  "Summarise this ticket and suggest a next step",
];

type SableMetadata = {
  proposals?: AssistantProposal[];
  toolCalls?: { name: string; input: unknown }[];
};

/** Convert a persisted transcript into assistant-ui / useChat UI messages. */
function hydrate(
  rows: {
    role: "user" | "assistant";
    content: string;
    toolCalls?: { name: string; input: unknown }[];
    proposals?: AssistantProposal[];
  }[],
): UIMessage<SableMetadata>[] {
  return rows.map((m, i) => ({
    id: `h${i}`,
    role: m.role,
    parts: [{ type: "text", text: m.content }],
    metadata:
      m.role === "assistant" ? { proposals: m.proposals, toolCalls: m.toolCalls } : undefined,
  }));
}

/**
 * The Sable chat surface, powered by assistant-ui: a `useChatRuntime` bound to
 * our streaming route (`/api/assistant/chat`) rendered through the scaffolded
 * `Thread`. Hydrates an existing conversation's transcript; a fresh chat's
 * conversation is created LAZILY on the first send (never on mount), so empty
 * "New chat" rows don't appear until the user actually chats.
 */
export function SableThread({
  conversationId,
  scope,
  context,
  overview,
  projectName,
  onOpenOverview,
  onConversationCreated,
  onActivity,
}: {
  conversationId: string | null;
  scope: AssistantScope;
  context?: { ticketId?: number; projectId?: string };
  /** Project overview (files + links) shown in the empty state when project-bound. */
  overview?: ReactNode;
  /** Active project name → a chip inside the composer (shown once a chat is under way). */
  projectName?: string | null;
  /** Chip click → back to the project overview. */
  onOpenOverview?: () => void;
  onConversationCreated?: (id: string) => void;
  onActivity?: () => void;
}) {
  const [initial, setInitial] = useState<UIMessage<SableMetadata>[]>([]);
  const [hydrating, setHydrating] = useState<boolean>(Boolean(conversationId));

  useEffect(() => {
    if (!conversationId) return;
    let ignore = false;
    getConversation(conversationId)
      .then((res) => {
        if (!ignore && res.ok) setInitial(hydrate(res.conversation.messages));
      })
      .finally(() => {
        if (!ignore) setHydrating(false);
      });
    return () => {
      ignore = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  if (hydrating) {
    return (
      <div className="grid flex-1 place-items-center">
        <Loader2 className="size-5 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <ThreadRuntime
      initialConversationId={conversationId}
      scope={scope}
      context={context}
      initialMessages={initial}
      overview={overview}
      projectName={projectName}
      onOpenOverview={onOpenOverview}
      onConversationCreated={onConversationCreated}
      onActivity={onActivity}
    />
  );
}

function ThreadRuntime({
  initialConversationId,
  scope,
  context,
  initialMessages,
  overview,
  projectName,
  onOpenOverview,
  onConversationCreated,
  onActivity,
}: {
  initialConversationId: string | null;
  scope: AssistantScope;
  context?: { ticketId?: number; projectId?: string };
  initialMessages: UIMessage<SableMetadata>[];
  overview?: ReactNode;
  projectName?: string | null;
  onOpenOverview?: () => void;
  onConversationCreated?: (id: string) => void;
  onActivity?: () => void;
}) {
  const [convId, setConvId] = useState<string | null>(initialConversationId);
  const convIdRef = useRef<string | null>(initialConversationId);

  // Create the conversation lazily on the FIRST send (not on mount) so a
  // never-used chat never hits the DB / the rail, then reuse it. The ref is read
  // only inside this send-time callback (deferred, not during render).
  const prepareRequest = useCallback(
    async ({ messages }: { messages: UIMessage<SableMetadata>[] }) => {
      let cid = convIdRef.current;
      if (!cid) {
        // Pin a freshly-created chat to the active project (if any) so it lands in
        // that project's pinned list, mirroring the rail's "New chat in project".
        const res = await createConversation(scope, context?.projectId ?? null);
        if (!res.ok) throw new Error(res.error ?? "Could not start a chat");
        cid = res.conversation.id;
        convIdRef.current = cid;
        setConvId(cid);
        onConversationCreated?.(cid);
      }
      return { body: { conversationId: cid, context, messages } };
    },
    [scope, context, onConversationCreated],
  );

  const transport = useMemo(
    () =>
      new AssistantChatTransport<UIMessage<SableMetadata>>({
        api: "/api/assistant/chat",
        prepareSendMessagesRequest: prepareRequest,
      }),
    [prepareRequest],
  );

  const adapters = useSableChatAdapters();

  const runtime = useChatRuntime<UIMessage<SableMetadata>>({
    transport,
    messages: initialMessages,
    adapters,
    onFinish: () => onActivity?.(),
  });

  // The composer's textarea auto-size (react-textarea-autosize) re-measures on
  // window resize but NOT when the panel morphs min↔max (its width animates, the
  // window doesn't). Observe our container and dispatch a resize each frame while
  // it changes size, so the input height tracks the width smoothly during the morph.
  const containerRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const el = containerRef.current;
    if (!el || typeof ResizeObserver === "undefined") return;
    let raf = 0;
    let lastW = -1;
    const ro = new ResizeObserver((entries) => {
      const w = Math.round(entries[0]?.contentRect.width ?? 0);
      if (w === lastW) return; // only react to WIDTH changes (avoid height feedback)
      lastW = w;
      if (raf) cancelAnimationFrame(raf);
      raf = requestAnimationFrame(() => window.dispatchEvent(new Event("resize")));
    });
    ro.observe(el);
    return () => {
      ro.disconnect();
      if (raf) cancelAnimationFrame(raf);
    };
  }, []);

  const projectChip = projectName ? (
    <button
      type="button"
      onClick={onOpenOverview}
      className="inline-flex max-w-full items-center gap-1.5 rounded-full border border-sable/25 bg-sable-muted/40 py-0.5 pr-2.5 pl-1.5 text-xs font-medium text-sable transition-colors hover:bg-sable-muted/70"
      title={`Back to ${projectName}`}
    >
      <Boxes className="size-3.5 shrink-0" />
      <span className="truncate font-display">{projectName}</span>
    </button>
  ) : null;

  return (
    <div ref={containerRef} className="flex min-h-0 min-w-0 flex-1 flex-col">
      <AssistantRuntimeProvider runtime={runtime}>
        <SableConversationContext.Provider value={convId ?? ""}>
          <Thread
            components={THREAD_COMPONENTS}
            suggestions={STARTER_SUGGESTIONS}
            editable={false}
            overview={overview}
            composerChip={projectChip}
          />
        </SableConversationContext.Provider>
      </AssistantRuntimeProvider>
    </div>
  );
}
