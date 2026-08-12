"use client";

import { useCallback, useEffect, useState } from "react";
import {
  DndContext,
  DragOverlay,
  PointerSensor,
  useSensor,
  useSensors,
  useDraggable,
  useDroppable,
  type DragEndEvent,
  type DragStartEvent,
} from "@dnd-kit/core";
import {
  Plus,
  Search,
  Folder,
  FolderPlus,
  FolderInput,
  ChevronRight,
  MoreHorizontal,
  Pencil,
  Trash2,
  Archive,
  ArchiveRestore,
  MessageSquare,
  Check,
  X,
  Loader2,
} from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuSub,
  DropdownMenuSubTrigger,
  DropdownMenuSubContent,
} from "@/components/ui/dropdown-menu";
import {
  listConversations,
  listFolders,
  createFolder,
  renameFolder,
  deleteFolder,
  moveConversation,
  renameConversation,
  archiveConversation,
  type ConversationSummary,
  type AiFolderSummary,
  type AssistantScope,
} from "@/lib/actions/ai-assistant";

/**
 * The premium conversation rail: a "New chat" action, search, user folders
 * (create / rename / delete, drag chats in and out) and an archived section.
 * Monochrome and restrained — the classy end of the ITSM palette.
 */
export function VioRail({
  activeId,
  onSelect,
  onNewChat,
  refreshKey,
  isAdmin = false,
  scope = "GENERAL",
  onScope,
}: {
  activeId: string | null;
  onSelect: (id: string) => void;
  onNewChat: () => void;
  /** Bumped by the shell after a turn / new chat so the rail refetches. */
  refreshKey: number;
  isAdmin?: boolean;
  scope?: AssistantScope;
  onScope?: (scope: AssistantScope) => void;
}) {
  const [convs, setConvs] = useState<ConversationSummary[]>([]);
  const [folders, setFolders] = useState<AiFolderSummary[]>([]);
  const [query, setQuery] = useState("");
  const [expanded, setExpanded] = useState<Record<string, boolean>>({});
  const [showArchived, setShowArchived] = useState(false);
  const [dragging, setDragging] = useState<ConversationSummary | null>(null);

  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 6 } }));

  const reload = useCallback(async () => {
    const [c, f] = await Promise.all([listConversations(), listFolders()]);
    setConvs(c);
    setFolders(f);
  }, []);

  useEffect(() => {
    let ignore = false;
    Promise.all([listConversations(), listFolders()]).then(([c, f]) => {
      if (ignore) return;
      setConvs(c);
      setFolders(f);
    });
    return () => {
      ignore = true;
    };
  }, [refreshKey]);

  const q = query.trim().toLowerCase();
  const match = (c: ConversationSummary) => !q || c.title.toLowerCase().includes(q);
  const active = convs.filter((c) => !c.archived && match(c));
  const archived = convs.filter((c) => c.archived && match(c));
  const ungrouped = active.filter((c) => !c.folderId);
  // Plain const (this repo uses the React compiler — don't useMemo derived lists).
  const byFolder: Record<string, ConversationSummary[]> = {};
  for (const f of folders) byFolder[f.id] = [];
  for (const c of active) if (c.folderId && byFolder[c.folderId]) byFolder[c.folderId].push(c);

  async function onDragStart(e: DragStartEvent) {
    setDragging(convs.find((c) => c.id === e.active.id) ?? null);
  }
  async function onDragEnd(e: DragEndEvent) {
    setDragging(null);
    const overId = e.over?.id ? String(e.over.id) : null;
    const convId = String(e.active.id);
    const conv = convs.find((c) => c.id === convId);
    if (!conv || !overId) return;
    const target = overId === "ungrouped" ? null : overId.startsWith("folder:") ? overId.slice(7) : undefined;
    if (target === undefined || target === (conv.folderId ?? null)) return;
    // Optimistic move.
    setConvs((cs) => cs.map((c) => (c.id === convId ? { ...c, folderId: target } : c)));
    const res = await moveConversation(convId, target);
    if (!res.ok) {
      toast.error(res.error ?? "Could not move");
      void reload();
    } else if (target) {
      setExpanded((s) => ({ ...s, [target]: true }));
    }
  }

  async function onCreateFolder() {
    const res = await createFolder();
    if (!res.ok) {
      toast.error(res.error ?? "Could not create folder");
      return;
    }
    setFolders((f) => [...f, res.folder]);
    setExpanded((s) => ({ ...s, [res.folder.id]: true }));
  }

  return (
    <DndContext
      id="vio-rail-dnd"
      sensors={sensors}
      onDragStart={onDragStart}
      onDragEnd={onDragEnd}
    >
      <div className="flex h-full min-h-0 flex-col gap-3 p-3">
        {isAdmin && onScope ? (
          <div className="flex items-center rounded-lg border bg-background p-0.5 text-xs">
            {(["GENERAL", "ADMIN"] as const).map((s) => (
              <button
                key={s}
                type="button"
                onClick={() => onScope(s)}
                className={cn(
                  "flex-1 rounded-md px-2 py-1 font-medium transition-colors",
                  scope === s ? "bg-vio text-vio-foreground" : "text-muted-foreground hover:text-foreground",
                )}
              >
                {s === "GENERAL" ? "General" : "Admin"}
              </button>
            ))}
          </div>
        ) : null}

        <Button
          type="button"
          onClick={onNewChat}
          className="w-full justify-start gap-2 rounded-lg bg-vio text-vio-foreground shadow-none hover:bg-vio/90"
        >
          <Plus className="size-4" /> New chat
        </Button>

        <div className="relative">
          <Search className="pointer-events-none absolute left-2.5 top-1/2 size-3.5 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search chats"
            className="h-8 rounded-lg pl-8 text-sm"
          />
        </div>

        <div className="-mr-1 min-h-0 flex-1 space-y-4 overflow-y-auto pr-1">
          {/* Folders */}
          <section className="space-y-0.5">
            <div className="flex items-center justify-between px-1.5 pb-0.5">
              <span className="text-[11px] font-medium uppercase tracking-wider text-muted-foreground">
                Folders
              </span>
              <Button
                type="button"
                size="icon-xs"
                variant="ghost"
                onClick={onCreateFolder}
                aria-label="New folder"
                className="text-muted-foreground hover:text-foreground"
              >
                <FolderPlus className="size-3.5" />
              </Button>
            </div>
            {folders.length === 0 ? (
              <p className="px-1.5 py-1 text-xs text-muted-foreground/70">
                Drag a chat here to create groups.
              </p>
            ) : (
              folders.map((f) => (
                <FolderNode
                  key={f.id}
                  folder={f}
                  chats={byFolder[f.id] ?? []}
                  open={expanded[f.id] ?? false}
                  onToggle={() => setExpanded((s) => ({ ...s, [f.id]: !s[f.id] }))}
                  activeId={activeId}
                  onSelect={onSelect}
                  folders={folders}
                  onChanged={reload}
                />
              ))
            )}
          </section>

          {/* Ungrouped chats */}
          <ChatSection
            id="ungrouped"
            label="Chats"
            chats={ungrouped}
            activeId={activeId}
            onSelect={onSelect}
            folders={folders}
            onChanged={reload}
            emptyHint={active.length === 0 ? "No conversations yet." : undefined}
          />

          {/* Archived */}
          {archived.length > 0 ? (
            <section className="space-y-0.5">
              <button
                type="button"
                onClick={() => setShowArchived((v) => !v)}
                className="flex w-full items-center gap-1 px-1.5 py-1 text-[11px] font-medium uppercase tracking-wider text-muted-foreground hover:text-foreground"
              >
                <ChevronRight className={cn("size-3 transition-transform", showArchived && "rotate-90")} />
                Archived ({archived.length})
              </button>
              {showArchived
                ? archived.map((c) => (
                    <ChatRow
                      key={c.id}
                      conv={c}
                      active={c.id === activeId}
                      onSelect={onSelect}
                      folders={folders}
                      onChanged={reload}
                    />
                  ))
                : null}
            </section>
          ) : null}
        </div>
      </div>

      <DragOverlay dropAnimation={null}>
        {dragging ? (
          <div className="pointer-events-none flex max-w-56 items-center gap-2 rounded-lg border bg-popover px-2 py-1.5 text-sm shadow-lg">
            <MessageSquare className="size-3.5 shrink-0 text-vio" />
            <span className="truncate">{dragging.title}</span>
          </div>
        ) : null}
      </DragOverlay>
    </DndContext>
  );
}

function ChatSection({
  id,
  label,
  chats,
  activeId,
  onSelect,
  folders,
  onChanged,
  emptyHint,
}: {
  id: string;
  label: string;
  chats: ConversationSummary[];
  activeId: string | null;
  onSelect: (id: string) => void;
  folders: AiFolderSummary[];
  onChanged: () => void;
  emptyHint?: string;
}) {
  const { setNodeRef, isOver } = useDroppable({ id });
  return (
    <section
      ref={setNodeRef}
      className={cn("space-y-0.5 rounded-lg transition-colors", isOver && "bg-vio-muted/60 ring-1 ring-border")}
    >
      <div className="px-1.5 pb-0.5 text-[11px] font-medium uppercase tracking-wider text-muted-foreground">
        {label}
      </div>
      {chats.length === 0 ? (
        emptyHint ? (
          <p className="px-1.5 py-1 text-xs text-muted-foreground/70">{emptyHint}</p>
        ) : null
      ) : (
        chats.map((c) => (
          <ChatRow
            key={c.id}
            conv={c}
            active={c.id === activeId}
            onSelect={onSelect}
            folders={folders}
            onChanged={onChanged}
          />
        ))
      )}
    </section>
  );
}

function FolderNode({
  folder,
  chats,
  open,
  onToggle,
  activeId,
  onSelect,
  folders,
  onChanged,
}: {
  folder: AiFolderSummary;
  chats: ConversationSummary[];
  open: boolean;
  onToggle: () => void;
  activeId: string | null;
  onSelect: (id: string) => void;
  folders: AiFolderSummary[];
  onChanged: () => void;
}) {
  const { setNodeRef, isOver } = useDroppable({ id: `folder:${folder.id}` });
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(folder.name);

  async function commitRename() {
    const next = draft.trim();
    setEditing(false);
    if (!next || next === folder.name) {
      setDraft(folder.name);
      return;
    }
    const res = await renameFolder(folder.id, next);
    if (res.ok) onChanged();
    else {
      toast.error(res.error ?? "Could not rename");
      setDraft(folder.name);
    }
  }

  return (
    <div
      ref={setNodeRef}
      className={cn("rounded-lg transition-colors", isOver && "bg-vio-muted/60 ring-1 ring-border")}
    >
      <div
        className={cn(
          "group/folder flex items-center gap-1 rounded-lg px-1.5 py-1 transition-colors hover:bg-muted/60",
        )}
      >
        {editing ? (
          <div className="flex flex-1 items-center gap-1">
            <Folder className="size-3.5 shrink-0 text-muted-foreground" />
            <Input
              autoFocus
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") { e.preventDefault(); void commitRename(); }
                else if (e.key === "Escape") { e.preventDefault(); setEditing(false); setDraft(folder.name); }
              }}
              onBlur={commitRename}
              className="h-6 flex-1 text-sm"
            />
          </div>
        ) : (
          <>
            <button
              type="button"
              onClick={onToggle}
              className="flex min-w-0 flex-1 items-center gap-1.5 text-left"
            >
              <ChevronRight className={cn("size-3 shrink-0 text-muted-foreground transition-transform", open && "rotate-90")} />
              <Folder className="size-3.5 shrink-0 text-muted-foreground" />
              <span className="min-w-0 flex-1 truncate text-sm font-medium">{folder.name}</span>
              {chats.length ? (
                <span className="text-[11px] text-muted-foreground">{chats.length}</span>
              ) : null}
            </button>
            <DropdownMenu>
              <DropdownMenuTrigger
                render={
                  <Button
                    type="button"
                    size="icon-xs"
                    variant="ghost"
                    aria-label="Folder options"
                    className="shrink-0 opacity-0 transition-opacity group-hover/folder:opacity-100 aria-expanded:opacity-100"
                  />
                }
              >
                <MoreHorizontal className="size-3.5" />
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                <DropdownMenuItem onClick={() => { setDraft(folder.name); setEditing(true); }}>
                  <Pencil className="size-3.5" /> Rename
                </DropdownMenuItem>
                <DropdownMenuItem
                  variant="destructive"
                  onClick={async () => {
                    const res = await deleteFolder(folder.id);
                    if (res.ok) onChanged();
                    else toast.error(res.error ?? "Could not delete");
                  }}
                >
                  <Trash2 className="size-3.5" /> Delete folder
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </>
        )}
      </div>

      {open ? (
        <div className="ml-3 border-l pl-1">
          {chats.length === 0 ? (
            <p className="px-1.5 py-1 text-xs text-muted-foreground/70">Empty — drag chats here.</p>
          ) : (
            chats.map((c) => (
              <ChatRow
                key={c.id}
                conv={c}
                active={c.id === activeId}
                onSelect={onSelect}
                folders={folders}
                onChanged={onChanged}
              />
            ))
          )}
        </div>
      ) : null}
    </div>
  );
}

function ChatRow({
  conv,
  active,
  onSelect,
  folders,
  onChanged,
}: {
  conv: ConversationSummary;
  active: boolean;
  onSelect: (id: string) => void;
  folders: AiFolderSummary[];
  onChanged: () => void;
}) {
  const { attributes, listeners, setNodeRef, isDragging } = useDraggable({ id: conv.id });
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(conv.title);
  const [pending, setPending] = useState(false);

  async function commitRename() {
    const next = draft.trim();
    setEditing(false);
    if (!next || next === conv.title) {
      setDraft(conv.title);
      return;
    }
    setPending(true);
    const res = await renameConversation(conv.id, next);
    setPending(false);
    if (res.ok) onChanged();
    else {
      toast.error(res.error ?? "Could not rename");
      setDraft(conv.title);
    }
  }

  async function move(folderId: string | null) {
    const res = await moveConversation(conv.id, folderId);
    if (res.ok) onChanged();
    else toast.error(res.error ?? "Could not move");
  }

  async function toggleArchive() {
    const res = await archiveConversation(conv.id, !conv.archived);
    if (res.ok) { onChanged(); toast.success(conv.archived ? "Restored" : "Archived"); }
    else toast.error(res.error ?? "Could not update");
  }

  if (editing) {
    return (
      <div className="flex items-center gap-1 px-1.5 py-1">
        <Input
          autoFocus
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") { e.preventDefault(); void commitRename(); }
            else if (e.key === "Escape") { e.preventDefault(); setEditing(false); setDraft(conv.title); }
          }}
          className="h-7 text-sm"
          disabled={pending}
        />
        <Button type="button" size="icon-xs" variant="ghost" onClick={commitRename} disabled={pending} aria-label="Save">
          {pending ? <Loader2 className="size-3 animate-spin" /> : <Check className="size-3" />}
        </Button>
        <Button type="button" size="icon-xs" variant="ghost" onClick={() => { setEditing(false); setDraft(conv.title); }} aria-label="Cancel">
          <X className="size-3" />
        </Button>
      </div>
    );
  }

  return (
    <div
      ref={setNodeRef}
      className={cn(
        "group/row flex items-center gap-1 rounded-lg px-1.5 py-1 transition-colors",
        active ? "bg-muted" : "hover:bg-muted/60",
        isDragging && "opacity-40",
      )}
    >
      <button
        type="button"
        onClick={() => onSelect(conv.id)}
        {...attributes}
        {...listeners}
        className="flex min-w-0 flex-1 items-center gap-2 text-left"
        title={conv.title}
      >
        <MessageSquare className={cn("size-3.5 shrink-0", active ? "text-vio" : "text-muted-foreground")} />
        <span
          className={cn(
            "min-w-0 flex-1 truncate text-sm",
            active ? "font-medium" : "text-foreground/90",
            conv.archived && "text-muted-foreground line-through",
          )}
        >
          {conv.title}
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
          <DropdownMenuItem onClick={() => { setDraft(conv.title); setEditing(true); }}>
            <Pencil className="size-3.5" /> Rename
          </DropdownMenuItem>
          <DropdownMenuSub>
            <DropdownMenuSubTrigger>
              <FolderInput className="size-3.5" /> Move to
            </DropdownMenuSubTrigger>
            <DropdownMenuSubContent>
              {conv.folderId ? (
                <DropdownMenuItem onClick={() => move(null)}>No folder</DropdownMenuItem>
              ) : null}
              {folders
                .filter((f) => f.id !== conv.folderId)
                .map((f) => (
                  <DropdownMenuItem key={f.id} onClick={() => move(f.id)}>
                    <Folder className="size-3.5" /> {f.name}
                  </DropdownMenuItem>
                ))}
              {folders.length === 0 ? (
                <DropdownMenuItem disabled>No folders yet</DropdownMenuItem>
              ) : null}
            </DropdownMenuSubContent>
          </DropdownMenuSub>
          <DropdownMenuSeparator />
          <DropdownMenuItem onClick={toggleArchive}>
            {conv.archived ? (
              <><ArchiveRestore className="size-3.5" /> Restore</>
            ) : (
              <><Archive className="size-3.5" /> Archive</>
            )}
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
    </div>
  );
}
