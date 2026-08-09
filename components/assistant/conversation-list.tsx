"use client";

import { useState, useTransition } from "react";
import { MoreHorizontal, Pencil, Archive, ArchiveRestore, Check, X, Loader2, MessageSquare } from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuItem,
} from "@/components/ui/dropdown-menu";
import { renameConversation, archiveConversation } from "@/lib/actions/ai-assistant";
import type { ConversationSummary } from "@/lib/actions/ai-assistant";

/** One row in the left rail. Handles active highlight, inline rename and archive/restore. */
function ConversationRow({
  conversation,
  active,
  onSelect,
  onRenamed,
  onArchivedChange,
}: {
  conversation: ConversationSummary;
  active: boolean;
  onSelect: () => void;
  onRenamed: (title: string) => void;
  onArchivedChange: (archived: boolean) => void;
}) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(conversation.title);
  const [pending, start] = useTransition();

  function commitRename() {
    const next = draft.trim();
    if (!next || next === conversation.title) {
      setEditing(false);
      setDraft(conversation.title);
      return;
    }
    start(async () => {
      const res = await renameConversation(conversation.id, next);
      if (res.ok) {
        onRenamed(next);
        setEditing(false);
      } else {
        toast.error(res.error ?? "Could not rename");
        setDraft(conversation.title);
      }
    });
  }

  function toggleArchive() {
    const next = !conversation.archived;
    start(async () => {
      const res = await archiveConversation(conversation.id, next);
      if (res.ok) {
        onArchivedChange(next);
        toast.success(next ? "Chat archived" : "Chat restored");
      } else {
        toast.error(res.error ?? "Could not update");
      }
    });
  }

  if (editing) {
    return (
      <div className="flex items-center gap-1 px-1.5 py-1">
        <Input
          autoFocus
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault();
              commitRename();
            } else if (e.key === "Escape") {
              e.preventDefault();
              setEditing(false);
              setDraft(conversation.title);
            }
          }}
          className="h-7 text-sm"
          disabled={pending}
        />
        <Button
          type="button"
          size="icon-xs"
          variant="ghost"
          onClick={commitRename}
          disabled={pending}
          aria-label="Save title"
        >
          {pending ? <Loader2 className="size-3 animate-spin" /> : <Check className="size-3" />}
        </Button>
        <Button
          type="button"
          size="icon-xs"
          variant="ghost"
          onClick={() => {
            setEditing(false);
            setDraft(conversation.title);
          }}
          disabled={pending}
          aria-label="Cancel"
        >
          <X className="size-3" />
        </Button>
      </div>
    );
  }

  return (
    <div
      className={cn(
        "group/row flex items-center gap-1 rounded-lg px-1.5 py-1 transition-colors",
        active ? "bg-muted" : "hover:bg-muted/60",
      )}
    >
      <button
        type="button"
        onClick={onSelect}
        className="flex min-w-0 flex-1 items-center gap-2 text-left"
        title={conversation.title}
      >
        <MessageSquare
          className={cn(
            "size-3.5 shrink-0",
            active ? "text-violet-500" : "text-muted-foreground",
          )}
        />
        <span
          className={cn(
            "min-w-0 flex-1 truncate text-sm",
            active ? "font-medium" : "text-foreground/90",
            conversation.archived && "text-muted-foreground line-through",
          )}
        >
          {conversation.title}
        </span>
      </button>
      <DropdownMenu>
        <DropdownMenuTrigger
          render={
            <Button
              type="button"
              size="icon-xs"
              variant="ghost"
              aria-label="Chat options"
              className="shrink-0 opacity-0 transition-opacity group-hover/row:opacity-100 aria-expanded:opacity-100"
            />
          }
        >
          <MoreHorizontal className="size-3.5" />
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end">
          <DropdownMenuItem onClick={() => setEditing(true)}>
            <Pencil className="size-3.5" /> Rename
          </DropdownMenuItem>
          <DropdownMenuItem onClick={toggleArchive}>
            {conversation.archived ? (
              <>
                <ArchiveRestore className="size-3.5" /> Restore
              </>
            ) : (
              <>
                <Archive className="size-3.5" /> Archive
              </>
            )}
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
    </div>
  );
}

/**
 * The left-rail list of persisted Vio conversations. Reverse-chronological,
 * active conversations first then archived, with an active highlight and
 * per-row rename / archive affordances.
 */
export function ConversationList({
  conversations,
  activeId,
  onSelect,
  onRenamed,
  onArchivedChange,
}: {
  conversations: ConversationSummary[];
  activeId: string | null;
  onSelect: (id: string) => void;
  onRenamed: (id: string, title: string) => void;
  onArchivedChange: (id: string, archived: boolean) => void;
}) {
  const live = conversations.filter((c) => !c.archived);
  const archived = conversations.filter((c) => c.archived);

  if (conversations.length === 0) {
    return (
      <div className="px-2 py-6 text-center text-xs text-muted-foreground">
        No conversations yet. Start a new chat to begin.
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-0.5 px-1.5 py-1">
      {live.map((c) => (
        <ConversationRow
          key={c.id}
          conversation={c}
          active={c.id === activeId}
          onSelect={() => onSelect(c.id)}
          onRenamed={(title) => onRenamed(c.id, title)}
          onArchivedChange={(archivedNext) => onArchivedChange(c.id, archivedNext)}
        />
      ))}

      {archived.length ? (
        <>
          <div className="mt-2 px-1.5 py-1 text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
            Archived
          </div>
          {archived.map((c) => (
            <ConversationRow
              key={c.id}
              conversation={c}
              active={c.id === activeId}
              onSelect={() => onSelect(c.id)}
              onRenamed={(title) => onRenamed(c.id, title)}
              onArchivedChange={(archivedNext) => onArchivedChange(c.id, archivedNext)}
            />
          ))}
        </>
      ) : null}
    </div>
  );
}
