"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Sparkles, X, ArrowUp, Loader2, AlertCircle, Send, Check } from "lucide-react";
import { cn } from "@/lib/utils";

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
type Proposal = TicketProposal | ServiceProposal;
type Msg = { role: "user" | "assistant"; text: string; html?: string };

const SUGGESTIONS = [
  "I forgot my password",
  "Request a new laptop",
  "My VPN won't connect",
];

export function VioWidget({
  firstName,
  previewOnly = false,
}: {
  firstName: string;
  previewOnly?: boolean;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [proposal, setProposal] = useState<Proposal | null>(null);
  const [creating, setCreating] = useState(false);
  const [messages, setMessages] = useState<Msg[]>([
    {
      role: "assistant",
      text: `Hi ${firstName}! I'm Vio. Ask me anything and I'll find an answer, point you to the right service, or open a request for you.`,
    },
  ]);
  const scrollRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: "smooth" });
  }, [messages, loading, proposal]);

  useEffect(() => {
    if (open) inputRef.current?.focus();
  }, [open]);

  async function send(text: string) {
    const trimmed = text.trim();
    if (!trimmed || loading) return;
    const next: Msg[] = [...messages, { role: "user", text: trimmed }];
    setMessages(next);
    setInput("");
    setProposal(null);
    setLoading(true);
    try {
      const res = await fetch("/api/portal/assistant", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ messages: next.map((m) => ({ role: m.role, content: m.text })) }),
      });
      const data = await res.json();
      if (data.configured === false) {
        setMessages((m) => [
          ...m,
          {
            role: "assistant",
            text: "Vio isn't switched on yet — ask your administrator to enable the AI assistant. In the meantime, you can browse answers or open a request.",
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
        body: JSON.stringify(proposal),
      });
      const data = await res.json();
      if (data.ok) {
        setMessages((m) => [
          ...m,
          {
            role: "assistant",
            text: `Done! I've opened ${data.ref} and routed it to the right team.`,
            html: `Done! I've opened <a href="${data.url}">${data.ref}</a> and routed it to the right team. You'll get updates on your ticket.`,
          },
        ]);
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

  return (
    <>
      {/* Launcher */}
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-label={open ? "Close Vio" : "Ask Vio"}
        className={cn(
          "fixed bottom-5 right-5 z-40 flex h-14 items-center gap-2 rounded-full bg-primary pl-4 pr-5 text-primary-foreground shadow-lg shadow-primary/25 transition-all hover:brightness-105 active:scale-95",
          open && "pointer-events-none scale-90 opacity-0",
        )}
      >
        <Sparkles className="size-5" />
        <span className="text-sm font-semibold">Ask Vio</span>
      </button>

      {/* Panel */}
      <div
        role="dialog"
        aria-label="Vio assistant"
        aria-hidden={!open}
        className={cn(
          "fixed bottom-5 right-5 z-50 flex max-h-[min(72vh,580px)] w-[calc(100vw-2.5rem)] flex-col overflow-hidden rounded-3xl border bg-popover shadow-2xl transition-all sm:w-[24rem]",
          open ? "translate-y-0 opacity-100" : "pointer-events-none translate-y-3 opacity-0",
        )}
      >
        {/* Header */}
        <div className="flex items-center gap-3 border-b bg-card/60 px-4 py-3">
          <span className="grid size-9 place-items-center rounded-xl bg-gradient-to-br from-primary to-primary/70 text-primary-foreground">
            <Sparkles className="size-4.5" />
          </span>
          <div className="min-w-0 flex-1">
            <p className="flex items-center gap-1.5 text-sm font-semibold leading-none">
              Vio
              {previewOnly ? (
                <span className="rounded-full bg-muted px-1.5 py-0.5 text-[10px] font-medium text-muted-foreground">
                  Preview
                </span>
              ) : null}
            </p>
            <p className="mt-1 text-xs text-muted-foreground">Help Center assistant</p>
          </div>
          <button
            type="button"
            onClick={() => setOpen(false)}
            aria-label="Close"
            className="grid size-8 place-items-center rounded-lg text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
          >
            <X className="size-4" />
          </button>
        </div>

        {/* Messages */}
        <div ref={scrollRef} className="flex-1 space-y-3 overflow-y-auto px-4 py-4">
          {messages.map((m, i) =>
            m.role === "user" ? (
              <div key={i} className="flex justify-end">
                <div className="max-w-[85%] rounded-2xl rounded-br-md bg-primary px-3.5 py-2 text-sm text-primary-foreground">
                  {m.text}
                </div>
              </div>
            ) : (
              <div key={i} className="flex">
                {m.html ? (
                  <div
                    className="max-w-[88%] rounded-2xl rounded-bl-md bg-muted/70 px-3.5 py-2.5 text-sm leading-relaxed prose prose-sm dark:prose-invert prose-p:my-1.5 prose-a:text-primary prose-a:font-medium prose-ul:my-1.5"
                    dangerouslySetInnerHTML={{ __html: m.html }}
                  />
                ) : (
                  <p className="max-w-[88%] rounded-2xl rounded-bl-md bg-muted/70 px-3.5 py-2.5 text-sm leading-relaxed">
                    {m.text}
                  </p>
                )}
              </div>
            ),
          )}

          {loading ? (
            <div className="flex">
              <span className="flex items-center gap-1 rounded-2xl rounded-bl-md bg-muted/70 px-3.5 py-3">
                <Dot /> <Dot delay="150ms" /> <Dot delay="300ms" />
              </span>
            </div>
          ) : null}

          {/* Draft request confirm card */}
          {proposal && !loading ? (
            <div className="rounded-2xl border bg-card p-3.5">
              {proposal.kind === "ticket" ? (
                <>
                  <div className="flex items-center gap-2 text-xs font-medium text-muted-foreground">
                    {proposal.type === "INCIDENT" ? (
                      <AlertCircle className="size-3.5 text-primary" />
                    ) : (
                      <Send className="size-3.5 text-primary" />
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
              ) : (
                <>
                  <div className="flex items-center gap-2 text-xs font-medium text-muted-foreground">
                    <Send className="size-3.5 text-primary" />
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
                  className="inline-flex items-center gap-1.5 rounded-lg bg-primary px-3 py-1.5 text-xs font-semibold text-primary-foreground transition-opacity disabled:opacity-50"
                >
                  {creating ? <Loader2 className="size-3.5 animate-spin" /> : <Check className="size-3.5" />}
                  {proposal.kind === "service" ? "Submit request" : "Create request"}
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
                  className="rounded-full border bg-card px-3 py-1.5 text-xs font-medium text-muted-foreground transition-colors hover:border-primary/40 hover:text-foreground"
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
          <div className="flex items-end gap-2 rounded-2xl border bg-card px-3 py-2 focus-within:border-primary/50 focus-within:ring-4 focus-within:ring-primary/10">
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
              placeholder="Ask Vio a question…"
              className="max-h-28 flex-1 resize-none bg-transparent py-1 text-sm outline-none placeholder:text-muted-foreground"
            />
            <button
              type="submit"
              disabled={!input.trim() || loading}
              aria-label="Send"
              className="grid size-8 shrink-0 place-items-center rounded-lg bg-primary text-primary-foreground transition-opacity disabled:opacity-40"
            >
              {loading ? <Loader2 className="size-4 animate-spin" /> : <ArrowUp className="size-4" />}
            </button>
          </div>
          <p className="mt-1.5 px-1 text-center text-[11px] text-muted-foreground">
            Vio can make mistakes. Check important details.
          </p>
        </form>
      </div>
    </>
  );
}

function titleCase(s: string) {
  return s.charAt(0) + s.slice(1).toLowerCase();
}

function Dot({ delay = "0ms" }: { delay?: string }) {
  return (
    <span
      className="size-1.5 animate-bounce rounded-full bg-muted-foreground/60"
      style={{ animationDelay: delay }}
    />
  );
}
