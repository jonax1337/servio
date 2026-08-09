"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import { Sparkles, Loader2, Paperclip, X, FileText, ArrowUp, ImagePlus } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { AI_ASSISTANT_NAME } from "@/lib/constants";
import {
  sendMessage,
  getConversation,
  type AssistantMessage,
  type AssistantScope,
} from "@/lib/actions/ai-assistant";
import { MessageList } from "./message-list";
import type { ProposalStatus } from "./proposal-card";

const GENERAL_SUGGESTIONS = [
  "Any similar past tickets for this issue?",
  "Search the knowledge base for VPN setup",
  "Draft a ticket for a broken printer",
];

const ADMIN_SUGGESTIONS = [
  "How many open tickets per team?",
  "Show tickets created in the last 7 days",
  "Review the current settings",
];

const MAX_ATTACHMENTS = 6;
const MAX_BYTES = 20 * 1024 * 1024; // reject anything over 20 MB before reading

/** An attachment staged in the composer (before send). */
type PendingAttachment = {
  id: string;
  name: string;
  type: string;
  size: number;
  kind: "image" | "file";
  dataUrl: string;
};

function humanSize(bytes: number) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function readAsDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve(String(r.result));
    r.onerror = () => reject(r.error);
    r.readAsDataURL(file);
  });
}

/** Load, downscale (max 1280px longest edge) and re-encode an image to keep payloads small. */
async function readImageDownscaled(file: File): Promise<string> {
  const dataUrl = await readAsDataUrl(file);
  try {
    const img = document.createElement("img");
    await new Promise<void>((res, rej) => {
      img.onload = () => res();
      img.onerror = rej;
      img.src = dataUrl;
    });
    const max = 1280;
    const scale = Math.min(1, max / Math.max(img.width, img.height));
    if (scale === 1 && file.size < 1_200_000) return dataUrl;
    const canvas = document.createElement("canvas");
    canvas.width = Math.max(1, Math.round(img.width * scale));
    canvas.height = Math.max(1, Math.round(img.height * scale));
    const ctx = canvas.getContext("2d");
    if (!ctx) return dataUrl;
    ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
    return file.type === "image/png"
      ? canvas.toDataURL("image/png")
      : canvas.toDataURL("image/jpeg", 0.85);
  } catch {
    return dataUrl;
  }
}

export type ChatPanelProps = {
  conversationId: string | null;
  scope: AssistantScope;
  ensureConversation?: () => Promise<string | null>;
  onTitleChange?: (conversationId: string, title: string) => void;
  onActivity?: (conversationId: string) => void;
  disabled?: boolean;
  /** In-context surface passed to sendMessage (e.g. the ticket being viewed). */
  context?: { ticketId?: number };
  /** Override the empty-state suggestion chips. */
  suggestions?: string[];
};

/**
 * The active-conversation view: a scrollable transcript plus a sticky composer
 * that accepts text, images (vision) and files (drag-drop, paste, or picker),
 * shows previews before sending, and talks to sendMessage (non-streaming).
 */
export function ChatPanel({
  conversationId,
  scope,
  ensureConversation,
  onTitleChange,
  onActivity,
  disabled = false,
  context,
  suggestions: suggestionsProp,
}: ChatPanelProps) {
  const [liveId, setLiveId] = useState<string | null>(conversationId);
  const [messages, setMessages] = useState<AssistantMessage[]>([]);
  const [hydrating, setHydrating] = useState(() => Boolean(conversationId));
  const [input, setInput] = useState("");
  const [attachments, setAttachments] = useState<PendingAttachment[]>([]);
  const [dragging, setDragging] = useState(false);
  const [pending, start] = useTransition();
  const [proposalState, setProposalState] = useState<Record<string, ProposalStatus>>({});
  const scrollRef = useRef<HTMLDivElement>(null);
  const taRef = useRef<HTMLTextAreaElement>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const dragDepth = useRef(0);

  const suggestions =
    suggestionsProp ?? (scope === "ADMIN" ? ADMIN_SUGGESTIONS : GENERAL_SUGGESTIONS);

  useEffect(() => {
    if (!conversationId) return;
    let ignore = false;
    getConversation(conversationId)
      .then((res) => {
        if (ignore) return;
        if (res.ok) setMessages(res.conversation.messages);
      })
      .finally(() => {
        if (!ignore) setHydrating(false);
      });
    return () => {
      ignore = true;
    };
  }, [conversationId]);

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: "smooth" });
  }, [messages, pending]);

  function autogrow() {
    const el = taRef.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = Math.min(el.scrollHeight, 200) + "px";
  }

  async function addFiles(files: File[]) {
    if (!files.length) return;
    const room = MAX_ATTACHMENTS - attachments.length;
    if (room <= 0) {
      toast.error(`You can attach up to ${MAX_ATTACHMENTS} files.`);
      return;
    }
    const staged: PendingAttachment[] = [];
    for (const f of files.slice(0, room)) {
      if (f.size > MAX_BYTES) {
        toast.error(`"${f.name}" is too large (max 20 MB).`);
        continue;
      }
      const isImg = f.type.startsWith("image/");
      try {
        const dataUrl = isImg ? await readImageDownscaled(f) : await readAsDataUrl(f);
        staged.push({
          id: crypto.randomUUID(),
          name: f.name,
          type: f.type,
          size: f.size,
          kind: isImg ? "image" : "file",
          dataUrl,
        });
      } catch {
        toast.error(`Could not read "${f.name}".`);
      }
    }
    if (staged.length) setAttachments((a) => [...a, ...staged]);
  }

  function removeAttachment(id: string) {
    setAttachments((a) => a.filter((x) => x.id !== id));
  }

  function onDrop(e: React.DragEvent) {
    e.preventDefault();
    dragDepth.current = 0;
    setDragging(false);
    if (disabled) return;
    const files = Array.from(e.dataTransfer.files ?? []);
    if (files.length) void addFiles(files);
  }

  function onPaste(e: React.ClipboardEvent) {
    const files = Array.from(e.clipboardData?.files ?? []);
    if (files.length) {
      e.preventDefault();
      void addFiles(files);
    }
  }

  function sendText(text: string, atts: PendingAttachment[] = []) {
    const q = text.trim();
    if ((!q && atts.length === 0) || pending || disabled) return;
    setInput("");
    setAttachments([]);
    requestAnimationFrame(autogrow);

    // Optimistically show the user's turn (image previews included).
    setMessages((m) => [
      ...m,
      {
        role: "user",
        content: q,
        attachments: atts.map((a) => ({
          name: a.name,
          type: a.type,
          size: a.size,
          kind: a.kind,
          dataUrl: a.kind === "image" ? a.dataUrl : undefined,
        })),
      },
    ]);

    start(async () => {
      let convId = liveId;
      if (!convId && ensureConversation) {
        convId = await ensureConversation();
        if (convId) setLiveId(convId);
      }
      if (!convId) {
        setMessages((m) => [
          ...m,
          { role: "assistant", content: "Could not start a conversation.", error: true },
        ]);
        return;
      }

      const res = await sendMessage({
        conversationId: convId,
        content: q,
        context,
        attachments: atts.map((a) => ({
          name: a.name,
          type: a.type,
          size: a.size,
          dataUrl: a.dataUrl,
        })),
      });
      if (!res.ok) {
        setMessages((m) => [...m, { role: "assistant", content: res.error, error: true }]);
        return;
      }
      setMessages((m) => [...m, res.message]);
      onTitleChange?.(res.conversationId, res.title);
      onActivity?.(res.conversationId);
    });
  }

  const emptyState = messages.length === 0 && !pending && !hydrating;
  const canSend = (input.trim().length > 0 || attachments.length > 0) && !pending && !disabled;

  return (
    <div
      className="relative flex min-h-0 min-w-0 flex-1 flex-col"
      onDragEnter={(e) => {
        e.preventDefault();
        if (disabled) return;
        dragDepth.current += 1;
        setDragging(true);
      }}
      onDragOver={(e) => e.preventDefault()}
      onDragLeave={(e) => {
        e.preventDefault();
        dragDepth.current -= 1;
        if (dragDepth.current <= 0) setDragging(false);
      }}
      onDrop={onDrop}
    >
      {dragging ? (
        <div className="pointer-events-none absolute inset-3 z-20 grid place-items-center rounded-2xl border-2 border-dashed border-violet-500/60 bg-violet-500/5 backdrop-blur-sm">
          <div className="flex flex-col items-center gap-2 text-violet-600 dark:text-violet-300">
            <ImagePlus className="size-7" />
            <p className="text-sm font-medium">Drop images or files to attach</p>
          </div>
        </div>
      ) : null}

      <div ref={scrollRef} className="flex-1 space-y-4 overflow-y-auto p-4 md:p-6">
        <div className="mx-auto flex min-h-full max-w-3xl flex-col">
          {emptyState ? (
            <div className="flex min-h-full flex-1 flex-col items-center justify-center gap-3 px-4 text-center">
              <span className="grid size-14 place-items-center rounded-2xl bg-gradient-to-br from-violet-500/15 to-fuchsia-500/15 text-violet-500 ring-1 ring-violet-500/20">
                <Sparkles className="size-7" />
              </span>
              <div>
                <p className="text-base font-semibold">{AI_ASSISTANT_NAME}</p>
                <p className="mt-1 max-w-md text-sm leading-relaxed text-muted-foreground">
                  {scope === "ADMIN"
                    ? "System-wide setup & management assistant. Ask for statistics, review config, or propose changes — you approve every one."
                    : "Your service desk copilot. I can read images and files you attach, search the knowledge base, past tickets, and the web, and draft tickets for you to approve."}
                </p>
              </div>
              <div className="flex flex-wrap justify-center gap-1.5">
                {suggestions.map((s) => (
                  <button
                    key={s}
                    type="button"
                    onClick={() => sendText(s)}
                    disabled={disabled}
                    className="rounded-full border border-violet-500/30 bg-violet-500/5 px-2.5 py-1 text-xs text-violet-600 transition-colors hover:bg-violet-500/10 active:scale-95 disabled:pointer-events-none disabled:opacity-50 dark:text-violet-300"
                  >
                    {s}
                  </button>
                ))}
              </div>
            </div>
          ) : hydrating && messages.length === 0 ? (
            <div className="flex min-h-full flex-1 items-center justify-center">
              <Loader2 className="size-5 animate-spin text-muted-foreground" />
            </div>
          ) : (
            <div className="space-y-4">
              <MessageList
                conversationId={liveId ?? ""}
                messages={messages}
                pending={pending}
                proposalState={proposalState}
                onProposalStatusChange={(key, next) =>
                  setProposalState((s) => ({ ...s, [key]: next }))
                }
              />
            </div>
          )}
        </div>
      </div>

      {/* Composer */}
      <div className="px-3 pb-3 pt-1">
        <div className="mx-auto max-w-3xl">
          <div
            className={cn(
              "rounded-[22px] border border-input bg-background shadow-sm transition-colors",
              "focus-within:border-ring focus-within:ring-[3px] focus-within:ring-ring/40",
              disabled && "opacity-60",
            )}
          >
            {attachments.length > 0 ? (
              <div className="flex flex-wrap gap-2 p-2.5 pb-0">
                {attachments.map((a) =>
                  a.kind === "image" ? (
                    <div
                      key={a.id}
                      className="group relative size-16 overflow-hidden rounded-xl border bg-muted"
                    >
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img src={a.dataUrl} alt={a.name} className="size-full object-cover" />
                      <button
                        type="button"
                        onClick={() => removeAttachment(a.id)}
                        aria-label={`Remove ${a.name}`}
                        className="absolute right-1 top-1 grid size-5 place-items-center rounded-full bg-black/60 text-white opacity-0 transition-opacity group-hover:opacity-100"
                      >
                        <X className="size-3" />
                      </button>
                    </div>
                  ) : (
                    <div
                      key={a.id}
                      className="group relative flex max-w-56 items-center gap-2 rounded-xl border bg-muted/40 py-2 pl-2.5 pr-8"
                    >
                      <span className="grid size-8 shrink-0 place-items-center rounded-lg bg-violet-500/10 text-violet-600 dark:text-violet-300">
                        <FileText className="size-4" />
                      </span>
                      <div className="min-w-0">
                        <p className="truncate text-xs font-medium">{a.name}</p>
                        <p className="text-[10px] text-muted-foreground">{humanSize(a.size)}</p>
                      </div>
                      <button
                        type="button"
                        onClick={() => removeAttachment(a.id)}
                        aria-label={`Remove ${a.name}`}
                        className="absolute right-1.5 top-1/2 grid size-5 -translate-y-1/2 place-items-center rounded-full text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
                      >
                        <X className="size-3" />
                      </button>
                    </div>
                  ),
                )}
              </div>
            ) : null}

            <div className="flex items-end gap-1 p-1.5">
              <input
                ref={fileRef}
                type="file"
                multiple
                hidden
                onChange={(e) => {
                  void addFiles(Array.from(e.target.files ?? []));
                  e.target.value = "";
                }}
              />
              <Button
                type="button"
                size="icon"
                variant="ghost"
                onClick={() => fileRef.current?.click()}
                disabled={disabled || attachments.length >= MAX_ATTACHMENTS}
                aria-label="Attach images or files"
                className="size-9 shrink-0 rounded-full text-muted-foreground hover:text-foreground"
              >
                <Paperclip className="size-[18px]" />
              </Button>

              <textarea
                ref={taRef}
                value={input}
                onChange={(e) => {
                  setInput(e.target.value);
                  autogrow();
                }}
                onKeyDown={(e) => {
                  if (e.key === "Enter" && !e.shiftKey) {
                    e.preventDefault();
                    sendText(input, attachments);
                  }
                }}
                onPaste={onPaste}
                placeholder={disabled ? "AI is not available…" : `Message ${AI_ASSISTANT_NAME}…`}
                rows={1}
                disabled={disabled}
                className="max-h-[200px] min-h-9 flex-1 resize-none bg-transparent px-1.5 py-2 text-sm leading-relaxed outline-none placeholder:text-muted-foreground disabled:opacity-50"
              />

              <Button
                type="button"
                size="icon"
                onClick={() => sendText(input, attachments)}
                disabled={!canSend}
                aria-label="Send"
                className="size-9 shrink-0 rounded-full active:scale-95"
              >
                {pending ? <Loader2 className="size-4 animate-spin" /> : <ArrowUp className="size-[18px]" />}
              </Button>
            </div>
          </div>
          <p className="mt-1.5 text-center text-[11px] text-muted-foreground">
            {AI_ASSISTANT_NAME} proposes changes; nothing is applied until you approve it.
          </p>
        </div>
      </div>
    </div>
  );
}
