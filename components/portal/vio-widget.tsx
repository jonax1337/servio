"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { X, ArrowUp, Loader2, AlertCircle, Send, Check, ImagePlus, MessageSquare } from "lucide-react";
import { iconForMime, formatBytes, MAX_UPLOAD_BYTES } from "@/lib/attachments-ui";
import { cn } from "@/lib/utils";
import { AI_ASSISTANT_NAME } from "@/lib/constants";
import { Button } from "@/components/ui/button";
import { Message, MessageContent } from "@/components/chatcn/ai/message";
import { Markdown } from "@/components/chatcn/ai/markdown";
import { TypingDots } from "@/components/assistant/typing-dots";
import {
  SableFab,
  SableHeader,
  SABLE_PANEL_FRAME,
  SABLE_MIN_SIZE,
  SABLE_ENTER,
  SABLE_EXIT,
} from "@/components/assistant/sable-chrome";

type TicketProposal = {
  kind: "ticket";
  title: string;
  type: "INCIDENT" | "REQUEST";
  priority: string;
  impact?: string;
  urgency?: string;
  description: string;
  categoryName?: string | null;
};
type ServiceProposal = {
  kind: "service";
  itemId: string;
  itemName: string;
  requiresApproval: boolean;
  answers: { key: string; label: string; value: string }[];
};
type CommentProposal = {
  kind: "comment";
  ticketId: number;
  ref: string;
  body: string;
};
type Proposal = TicketProposal | ServiceProposal | CommentProposal;

/** A file the user attached in chat: sent to the model as a data URL, and
 *  staged (uploaded) so it can be linked to a ticket Vio opens. */
type ChatAttachment = {
  id?: string; // staged attachment id (once uploaded)
  name: string;
  type: string;
  size: number;
  dataUrl: string;
  previewUrl?: string; // object URL for image thumbnails
  uploading: boolean;
};
type Msg = {
  role: "user" | "assistant";
  text: string;
  html?: string;
  images?: string[]; // preview URLs for the user's attached images
};

const SUGGESTIONS = [
  "I forgot my password",
  "Request a new laptop",
  "My VPN won't connect",
];

const CHAT_ACCEPT =
  "image/png,image/jpeg,image/gif,image/webp,application/pdf,.docx,.xlsx,.pptx,.txt,.log,.csv,.eml";
const MAX_CHAT_ATTACHMENTS = 4;

function readAsDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve(String(r.result));
    r.onerror = () => reject(r.error);
    r.readAsDataURL(file);
  });
}

/** Downscale (max 1280px longest edge) + re-encode an image to keep payloads small. */
async function readImageDownscaled(file: File): Promise<string> {
  const dataUrl = await readAsDataUrl(file);
  try {
    const img = document.createElement("img");
    await new Promise<void>((res, rej) => { img.onload = () => res(); img.onerror = rej; img.src = dataUrl; });
    const max = 1280;
    const scale = Math.min(1, max / Math.max(img.width, img.height));
    if (scale === 1 && file.size < 1_200_000) return dataUrl;
    const canvas = document.createElement("canvas");
    canvas.width = Math.max(1, Math.round(img.width * scale));
    canvas.height = Math.max(1, Math.round(img.height * scale));
    const ctx = canvas.getContext("2d");
    if (!ctx) return dataUrl;
    ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
    return file.type === "image/png" ? canvas.toDataURL("image/png") : canvas.toDataURL("image/jpeg", 0.85);
  } catch {
    return dataUrl;
  }
}

export function VioWidget({
  firstName,
  previewOnly = false,
}: {
  firstName: string;
  previewOnly?: boolean;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [closing, setClosing] = useState(false);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [proposal, setProposal] = useState<Proposal | null>(null);
  const [creating, setCreating] = useState(false);
  const [attachments, setAttachments] = useState<ChatAttachment[]>([]);
  const [attachError, setAttachError] = useState<string | null>(null);
  const [messages, setMessages] = useState<Msg[]>([
    {
      role: "assistant",
      text: `Hi ${firstName}! I'm ${AI_ASSISTANT_NAME}. Ask me anything, attach a screenshot of an error, and I'll find an answer, point you to the right service, or open a request for you.`,
    },
  ]);
  const scrollRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  // Staged attachment ids accumulated this chat, linked onto a ticket Vio opens.
  const pendingIds = useRef<string[]>([]);

  async function onPickFiles(list: FileList | null) {
    if (!list || list.length === 0) return;
    setAttachError(null);
    const room = MAX_CHAT_ATTACHMENTS - attachments.length;
    for (const file of Array.from(list).slice(0, Math.max(0, room))) {
      if (file.size > MAX_UPLOAD_BYTES) {
        setAttachError(`${file.name} is larger than ${formatBytes(MAX_UPLOAD_BYTES)}.`);
        continue;
      }
      const isImg = file.type.startsWith("image/");
      const dataUrl = isImg ? await readImageDownscaled(file) : await readAsDataUrl(file);
      const previewUrl = isImg ? URL.createObjectURL(file) : undefined;
      const att: ChatAttachment = { name: file.name, type: file.type, size: file.size, dataUrl, previewUrl, uploading: true };
      setAttachments((a) => [...a, att]);
      // Stage-upload so it can be linked to a ticket later (best-effort).
      const fd = new FormData();
      fd.set("file", file);
      try {
        const res = await fetch("/api/files/upload", { method: "POST", body: fd });
        if (res.ok) {
          const r = await res.json();
          setAttachments((a) => a.map((x) => (x === att ? { ...x, id: r.id, uploading: false } : x)));
        } else {
          setAttachments((a) => a.map((x) => (x === att ? { ...x, uploading: false } : x)));
        }
      } catch {
        setAttachments((a) => a.map((x) => (x === att ? { ...x, uploading: false } : x)));
      }
    }
    if (fileRef.current) fileRef.current.value = "";
  }

  function removeAttachment(target: ChatAttachment) {
    if (target.previewUrl) URL.revokeObjectURL(target.previewUrl);
    setAttachments((a) => a.filter((x) => x !== target));
  }

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: "smooth" });
  }, [messages, loading, proposal]);

  useEffect(() => {
    if (open) inputRef.current?.focus();
  }, [open]);

  async function send(text: string) {
    const trimmed = text.trim();
    const atts = attachments;
    if ((!trimmed && atts.length === 0) || loading) return;
    // Wait for any in-flight staging so ids are available for linking.
    if (atts.some((a) => a.uploading)) return;
    pendingIds.current.push(...atts.map((a) => a.id).filter((x): x is string => !!x));
    const next: Msg[] = [
      ...messages,
      { role: "user", text: trimmed || "(see attachment)", images: atts.filter((a) => a.previewUrl).map((a) => a.previewUrl!) },
    ];
    setMessages(next);
    setInput("");
    setAttachments([]);
    setProposal(null);
    setLoading(true);
    try {
      const res = await fetch("/api/portal/assistant", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          messages: next.map((m) => ({ role: m.role, content: m.text })),
          attachments: atts.map((a) => ({ name: a.name, type: a.type, size: a.size, dataUrl: a.dataUrl })),
        }),
      });
      const data = await res.json();
      if (data.configured === false) {
        setMessages((m) => [
          ...m,
          {
            role: "assistant",
            text: `${AI_ASSISTANT_NAME} isn't switched on yet — ask your administrator to enable the AI assistant. In the meantime, you can browse answers or open a request.`,
          },
        ]);
      } else if (data.html) {
        setMessages((m) => [...m, { role: "assistant", text: data.text ?? "", html: data.html }]);
        if (data.proposal) setProposal(data.proposal);
      } else {
        setMessages((m) => [
          ...m,
          { role: "assistant", text: data.error ?? "Something went wrong. Please try again." },
        ]);
      }
    } catch {
      setMessages((m) => [
        ...m,
        { role: "assistant", text: "I couldn't reach the server. Please try again in a moment." },
      ]);
    } finally {
      setLoading(false);
    }
  }

  async function createRequest() {
    if (!proposal || creating) return;
    setCreating(true);
    try {
      const res = await fetch("/api/portal/assistant/create", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...proposal, attachmentIds: pendingIds.current }),
      });
      const data = await res.json();
      if (data.ok) {
        let text: string;
        let html: string;
        if (data.posted) {
          text = `Done! I've posted your reply on ${data.ref}.`;
          html = `Done! I've posted your reply on <a href="${data.url}">${data.ref}</a>. The team will see it.`;
        } else {
          const withFiles = pendingIds.current.length > 0 ? " with your attachments" : "";
          text = `Done! I've opened ${data.ref} and routed it to the right team.`;
          html = `Done! I've opened <a href="${data.url}">${data.ref}</a>${withFiles} and routed it to the right team. You'll get updates on your ticket.`;
        }
        pendingIds.current = [];
        setMessages((m) => [...m, { role: "assistant", text, html }]);
        setProposal(null);
        router.refresh();
      } else {
        setMessages((m) => [
          ...m,
          { role: "assistant", text: data.error ?? "Couldn't create the request. Please try the request form." },
        ]);
      }
    } catch {
      setMessages((m) => [
        ...m,
        { role: "assistant", text: "Couldn't reach the server to create the request. Please try again." },
      ]);
    } finally {
      setCreating(false);
    }
  }

  const handleClose = () => {
    setClosing(true);
    window.setTimeout(() => {
      setClosing(false);
      setOpen(false);
    }, 160);
  };

  return (
    <>
      {/* Launcher — icon-only, identical to the console FAB (no label). */}
      {!open ? <SableFab onClick={() => setOpen(true)} /> : null}

      {/* Window — the same small card as the console; no maximised state here. */}
      {open ? (
        <div className="pointer-events-none fixed inset-0 z-50 flex items-end justify-end p-4">
          <div
            role="dialog"
            aria-label={`${AI_ASSISTANT_NAME} assistant`}
            className={cn(
              "pointer-events-auto relative",
              SABLE_PANEL_FRAME,
              SABLE_MIN_SIZE,
              closing ? SABLE_EXIT : SABLE_ENTER,
            )}
          >
            <SableHeader
              subtitle="Help Center assistant"
              extra={
                previewOnly ? (
                  <span className="rounded-full bg-muted px-1.5 py-0.5 text-[10px] font-medium text-muted-foreground">
                    Preview
                  </span>
                ) : null
              }
            >
              <Button type="button" variant="ghost" size="icon-sm" onClick={handleClose} aria-label="Close">
                <X className="size-4" />
              </Button>
            </SableHeader>

        {/* Messages */}
        <div ref={scrollRef} className="flex-1 space-y-3 overflow-y-auto px-4 py-4">
          {messages.map((m, i) =>
            m.role === "user" ? (
              <Message key={i} variant="user">
                <MessageContent className="bg-vio text-vio-foreground">
                  {m.images && m.images.length > 0 ? (
                    <div className="mb-1.5 flex flex-wrap justify-end gap-1.5">
                      {m.images.map((src, k) => (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img key={k} src={src} alt="" className="size-20 rounded-lg border object-cover" />
                      ))}
                    </div>
                  ) : null}
                  {m.text}
                </MessageContent>
              </Message>
            ) : (
              <Message key={i} variant="ai">
                <MessageContent className="bg-transparent p-0 text-foreground">
                  <Markdown>{m.text}</Markdown>
                </MessageContent>
              </Message>
            ),
          )}

          {loading ? (
            <Message variant="ai">
              <MessageContent className="bg-transparent p-0">
                <TypingDots />
              </MessageContent>
            </Message>
          ) : null}

          {/* Draft request confirm card */}
          {proposal && !loading ? (
            <div className="rounded-2xl border bg-card p-3.5">
              {proposal.kind === "ticket" ? (
                <>
                  <div className="flex items-center gap-2 text-xs font-medium text-muted-foreground">
                    {proposal.type === "INCIDENT" ? (
                      <AlertCircle className="size-3.5 text-vio" />
                    ) : (
                      <Send className="size-3.5 text-vio" />
                    )}
                    {proposal.type === "INCIDENT" ? "New issue" : "New request"} · {titleCase(proposal.priority)} priority
                    {proposal.categoryName ? ` · ${proposal.categoryName}` : ""}
                  </div>
                  <p className="mt-1.5 text-sm font-medium">{proposal.title}</p>
                  {proposal.description ? (
                    <p className="mt-1 line-clamp-3 text-xs text-muted-foreground">{proposal.description}</p>
                  ) : null}
                  {proposal.impact || proposal.urgency ? (
                    <p className="mt-1.5 text-[11px] text-muted-foreground">
                      Impact {titleCase(proposal.impact ?? "medium")} · Urgency {titleCase(proposal.urgency ?? "medium")}
                    </p>
                  ) : null}
                </>
              ) : proposal.kind === "comment" ? (
                <>
                  <div className="flex items-center gap-2 text-xs font-medium text-muted-foreground">
                    <MessageSquare className="size-3.5 text-vio" />
                    Reply to {proposal.ref}
                  </div>
                  <p className="mt-1.5 text-sm">{proposal.body}</p>
                </>
              ) : (
                <>
                  <div className="flex items-center gap-2 text-xs font-medium text-muted-foreground">
                    <Send className="size-3.5 text-vio" />
                    Catalog request{proposal.requiresApproval ? " · needs approval" : ""}
                  </div>
                  <p className="mt-1.5 text-sm font-medium">{proposal.itemName}</p>
                  {proposal.answers.filter((a) => a.value).length > 0 ? (
                    <dl className="mt-2 grid gap-1">
                      {proposal.answers
                        .filter((a) => a.value)
                        .map((a) => (
                          <div key={a.key} className="flex gap-2 text-xs">
                            <dt className="shrink-0 text-muted-foreground">{a.label}:</dt>
                            <dd className="min-w-0 truncate font-medium">{a.value}</dd>
                          </div>
                        ))}
                    </dl>
                  ) : null}
                </>
              )}
              <div className="mt-3 flex items-center gap-2">
                <button
                  type="button"
                  onClick={createRequest}
                  disabled={creating}
                  className="inline-flex items-center gap-1.5 rounded-lg bg-vio px-3 py-1.5 text-xs font-semibold text-vio-foreground transition-opacity hover:bg-vio/90 disabled:opacity-50"
                >
                  {creating ? <Loader2 className="size-3.5 animate-spin" /> : <Check className="size-3.5" />}
                  {proposal.kind === "service" ? "Submit request" : proposal.kind === "comment" ? "Post reply" : "Create request"}
                </button>
                <button
                  type="button"
                  onClick={() => setProposal(null)}
                  disabled={creating}
                  className="rounded-lg px-3 py-1.5 text-xs font-medium text-muted-foreground transition-colors hover:bg-muted disabled:opacity-50"
                >
                  Not now
                </button>
              </div>
            </div>
          ) : null}

          {/* Suggestions — only before the first user turn */}
          {messages.length === 1 && !loading ? (
            <div className="flex flex-wrap gap-2 pt-1">
              {SUGGESTIONS.map((s) => (
                <button
                  key={s}
                  type="button"
                  onClick={() => send(s)}
                  className="rounded-lg border bg-card px-3 py-1.5 text-xs font-medium text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
                >
                  {s}
                </button>
              ))}
            </div>
          ) : null}
        </div>

        {/* Composer */}
        <form
          onSubmit={(e) => {
            e.preventDefault();
            send(input);
          }}
          className="border-t p-3"
        >
          {attachments.length > 0 ? (
            <div className="mb-2 flex flex-wrap gap-2">
              {attachments.map((a, i) => {
                const Icon = iconForMime(a.type);
                return (
                  <span key={i} className="group relative inline-flex items-center gap-2 rounded-lg border bg-card py-1 pl-1 pr-2 text-xs">
                    {a.previewUrl ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={a.previewUrl} alt="" className="size-8 rounded-md object-cover" />
                    ) : (
                      <span className="grid size-8 place-items-center rounded-md bg-muted text-muted-foreground"><Icon className="size-4" /></span>
                    )}
                    <span className="max-w-28 truncate font-medium">{a.name}</span>
                    {a.uploading ? <Loader2 className="size-3.5 animate-spin text-muted-foreground" /> : null}
                    <button type="button" onClick={() => removeAttachment(a)} aria-label={`Remove ${a.name}`} className="grid size-4 place-items-center rounded text-muted-foreground hover:text-foreground">
                      <X className="size-3" />
                    </button>
                  </span>
                );
              })}
            </div>
          ) : null}
          {attachError ? <p className="mb-1.5 px-1 text-xs text-destructive">{attachError}</p> : null}

          <div className="flex items-end gap-1.5 rounded-lg border bg-card px-2 py-2 focus-within:border-ring focus-within:ring-[3px] focus-within:ring-ring/40">
            <button
              type="button"
              onClick={() => fileRef.current?.click()}
              disabled={attachments.length >= MAX_CHAT_ATTACHMENTS}
              aria-label="Attach a screenshot or file"
              className="grid size-8 shrink-0 place-items-center rounded-lg text-muted-foreground transition-colors hover:bg-muted hover:text-foreground disabled:opacity-40"
            >
              <ImagePlus className="size-4.5" />
            </button>
            <input ref={fileRef} type="file" multiple accept={CHAT_ACCEPT} className="hidden" onChange={(e) => onPickFiles(e.target.files)} />
            <textarea
              ref={inputRef}
              rows={1}
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && !e.shiftKey) {
                  e.preventDefault();
                  send(input);
                }
              }}
              placeholder={`Ask ${AI_ASSISTANT_NAME}, or attach a screenshot…`}
              className="max-h-28 flex-1 resize-none bg-transparent py-1 text-sm outline-none placeholder:text-muted-foreground"
            />
            <button
              type="submit"
              disabled={(!input.trim() && attachments.length === 0) || loading || attachments.some((a) => a.uploading)}
              aria-label="Send"
              className="grid size-8 shrink-0 place-items-center rounded-lg bg-vio text-vio-foreground transition-opacity hover:bg-vio/90 disabled:opacity-40"
            >
              {loading ? <Loader2 className="size-4 animate-spin" /> : <ArrowUp className="size-4" />}
            </button>
          </div>
          <p className="mt-1.5 px-1 text-center text-[11px] text-muted-foreground">
            {AI_ASSISTANT_NAME} can make mistakes. Check important details.
          </p>
        </form>
          </div>
        </div>
      ) : null}
    </>
  );
}

function titleCase(s: string) {
  return s.charAt(0) + s.slice(1).toLowerCase();
}
