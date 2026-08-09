"use client";

import { useCallback, useMemo, useState } from "react";
import { Plus } from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { ConversationList } from "./conversation-list";
import { ChatPanel } from "./chat-panel";
import { createConversation } from "@/lib/actions/ai-assistant";
import type { AssistantScope, ConversationSummary } from "@/lib/actions/ai-assistant";

const SCOPES: { value: AssistantScope; label: string }[] = [
  { value: "GENERAL", label: "General" },
  { value: "ADMIN", label: "Admin" },
];

/** What the chat panel is currently showing. */
type Selection =
  | { kind: "new"; scope: AssistantScope; nonce: number }
  | { kind: "open"; id: string };

/** Sort helper: newest-updated first (matches the server ordering). */
function byUpdatedDesc(a: ConversationSummary, b: ConversationSummary) {
  return b.updatedAt.localeCompare(a.updatedAt);
}

/**
 * Two-pane standalone Vio surface: a left rail (scope switcher + new-chat +
 * conversation list) and the active chat panel. Scope switcher only renders for
 * admins (defence-in-depth; the server is authoritative).
 *
 * Key subtlety: the panel is remounted (via `key`) only when the user EXPLICITLY
 * opens a different conversation or starts a new chat — NOT when a fresh draft is
 * lazily assigned an id on its first message. That keeps the optimistic turn (and
 * pending state) alive through the create; the rail highlight is tracked
 * separately from what the panel renders.
 */
export function AssistantShell({
  isAdmin,
  initialConversations,
}: {
  isAdmin: boolean;
  initialConversations: ConversationSummary[];
}) {
  const [conversations, setConversations] = useState<ConversationSummary[]>(
    () => [...initialConversations].sort(byUpdatedDesc),
  );
  const [scope, setScope] = useState<AssistantScope>("GENERAL");
  const [selection, setSelection] = useState<Selection>({
    kind: "new",
    scope: "GENERAL",
    nonce: 0,
  });
  // Which rail row is highlighted. Independent of `selection` so a draft that
  // just got persisted can be highlighted without remounting the panel.
  const [railActiveId, setRailActiveId] = useState<string | null>(null);

  const visible = useMemo(
    () => conversations.filter((c) => c.scope === scope).sort(byUpdatedDesc),
    [conversations, scope],
  );

  const panelKey =
    selection.kind === "new" ? `new-${selection.scope}-${selection.nonce}` : selection.id;
  const panelConversationId = selection.kind === "open" ? selection.id : null;
  const panelScope = selection.kind === "new" ? selection.scope : scope;

  function switchScope(next: AssistantScope) {
    if (next === scope) return;
    setScope(next);
    setSelection({ kind: "new", scope: next, nonce: Date.now() });
    setRailActiveId(null);
  }

  const handleNewChat = useCallback(() => {
    setSelection({ kind: "new", scope, nonce: Date.now() });
    setRailActiveId(null);
  }, [scope]);

  const handleSelect = useCallback((id: string) => {
    setSelection({ kind: "open", id });
    setRailActiveId(id);
  }, []);

  /**
   * Create a conversation row for the current scope. Called lazily by the chat
   * panel on the first message of a fresh chat. Adds it to the rail and
   * highlights it, but leaves `selection` as the draft so the panel is NOT
   * remounted (its optimistic turn + pending state stay intact).
   */
  const ensureConversation = useCallback(async (): Promise<string | null> => {
    const res = await createConversation(scope);
    if (!res.ok) {
      toast.error(res.error ?? "Could not start a chat");
      return null;
    }
    setConversations((prev) => [res.conversation, ...prev].sort(byUpdatedDesc));
    setRailActiveId(res.conversation.id);
    return res.conversation.id;
  }, [scope]);

  const handleTitleChange = useCallback((id: string, title: string) => {
    setConversations((prev) => prev.map((c) => (c.id === id ? { ...c, title } : c)));
  }, []);

  const handleActivity = useCallback((id: string) => {
    setConversations((prev) =>
      prev.map((c) => (c.id === id ? { ...c, updatedAt: new Date().toISOString() } : c)),
    );
  }, []);

  const handleArchivedChange = useCallback(
    (id: string, archived: boolean) => {
      setConversations((prev) => prev.map((c) => (c.id === id ? { ...c, archived } : c)));
      if (archived && railActiveId === id) {
        setSelection({ kind: "new", scope, nonce: Date.now() });
        setRailActiveId(null);
      }
    },
    [railActiveId, scope],
  );

  return (
    <div className="flex min-h-0 flex-1">
      {/* Left rail */}
      <aside className="flex w-64 shrink-0 flex-col overflow-hidden border-r">
        <div className="flex flex-col gap-2 border-b p-2">
          {isAdmin ? (
            <div
              role="tablist"
              aria-label="Chat scope"
              className="flex rounded-lg bg-muted p-0.5 text-sm"
            >
              {SCOPES.map((s) => (
                <button
                  key={s.value}
                  type="button"
                  role="tab"
                  aria-selected={scope === s.value}
                  onClick={() => switchScope(s.value)}
                  className={cn(
                    "flex-1 rounded-md px-2 py-1 font-medium transition-colors",
                    scope === s.value
                      ? "bg-background text-foreground shadow-sm"
                      : "text-muted-foreground hover:text-foreground",
                  )}
                >
                  {s.label}
                </button>
              ))}
            </div>
          ) : null}

          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={handleNewChat}
            className="w-full justify-start"
          >
            <Plus className="size-3.5" />
            New chat
          </Button>
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto">
          <ConversationList
            conversations={visible}
            activeId={railActiveId}
            onSelect={handleSelect}
            onRenamed={handleTitleChange}
            onArchivedChange={handleArchivedChange}
          />
        </div>
      </aside>

      {/* Active view */}
      <ChatPanel
        key={panelKey}
        conversationId={panelConversationId}
        scope={panelScope}
        ensureConversation={ensureConversation}
        onTitleChange={handleTitleChange}
        onActivity={handleActivity}
      />
    </div>
  );
}
