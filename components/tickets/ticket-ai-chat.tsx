"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import { Sparkles, Send, Loader2, Globe, X, AlertTriangle, Check, Wand2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { chatWithAi, applyTicketProposal, type ChatMessage, type ChatProposal } from "@/lib/actions/ai-chat";
import { AI_TEASER_MESSAGE, AI_ASSISTANT_NAME } from "@/lib/constants";

type Msg = ChatMessage & {
  html?: string;
  tools?: { name: string; input: unknown }[];
  proposals?: ChatProposal[];
  error?: boolean;
};

type ProposalStatus = { status: "idle" | "applying" | "applied" | "error" | "dismissed"; msg?: string };

const SUGGESTIONS = ["Summarize this ticket", "Any similar past tickets?", "Check the knowledge base"];

function toolLabel(name: string) {
  switch (name) {
    case "web_search": return "Searched web";
    case "fetch_url": return "Read page";
    case "search_knowledge_base": return "Searched KB";
    case "search_tickets": return "Searched tickets";
    case "search_problems": return "Searched problems";
    case "search_changes": return "Searched changes";
    default: return name;
  }
}

function TypingDots() {
  return (
    <span className="inline-flex items-center gap-1" aria-label="Assistant is typing">
      {[0, 1, 2].map((i) => (
        <span
          key={i}
          className="size-2 animate-bounce rounded-full bg-violet-500 motion-reduce:animate-none"
          style={{ animationDelay: `${i * 0.15}s` }}
        />
      ))}
    </span>
  );
}

/** Ticket-scoped AI chat with tool use (web search) as a floating dock. */
export function TicketAiChat({ ticketId, teaser = false }: { ticketId: number; teaser?: boolean }) {
  const [open, setOpen] = useState(false);
  const [messages, setMessages] = useState<Msg[]>([]);
  const [input, setInput] = useState("");
  const [pending, start] = useTransition();
  const [, startApply] = useTransition();
  const [proposalState, setProposalState] = useState<Record<string, ProposalStatus>>({});
  const scrollRef = useRef<HTMLDivElement>(null);
  const taRef = useRef<HTMLTextAreaElement>(null);

  function approveProposal(key: string, p: ChatProposal) {
    setProposalState((s) => ({ ...s, [key]: { status: "applying" } }));
    startApply(async () => {
      const res = await applyTicketProposal(ticketId, p);
      if (res.ok) {
        setProposalState((s) => ({ ...s, [key]: { status: "applied", msg: res.applied } }));
        toast.success(res.applied ?? "Applied");
      } else {
        setProposalState((s) => ({ ...s, [key]: { status: "error", msg: res.error } }));
        toast.error(res.error ?? "Could not apply");
      }
    });
  }

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: "smooth" });
  }, [messages, pending, open]);

  function autogrow() {
    const el = taRef.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = Math.min(el.scrollHeight, 120) + "px";
  }

  function sendText(text: string) {
    if (teaser) return void toast.info(AI_TEASER_MESSAGE);
    const q = text.trim();
    if (!q || pending) return;
    const next: Msg[] = [...messages, { role: "user", content: q }];
    setMessages(next);
    setInput("");
    requestAnimationFrame(autogrow);
    start(async () => {
      const res = await chatWithAi(ticketId, next.map((m) => ({ role: m.role, content: m.content })));
      if (!res.ok) {
        setMessages((m) => [...m, { role: "assistant", content: res.error, error: true }]);
        return;
      }
      setMessages((m) => [
        ...m,
        { role: "assistant", content: res.text, html: res.html, tools: res.toolCalls, proposals: res.proposals },
      ]);
    });
  }

  return (
    <>
      {/* Launcher */}
      <Button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-label={open ? `Close ${AI_ASSISTANT_NAME}` : `Open ${AI_ASSISTANT_NAME}`}
        className={cn(
          "fixed bottom-5 right-5 z-40 size-12 rounded-full p-0",
          "bg-gradient-to-br from-violet-500 to-fuchsia-500 text-white",
          "shadow-lg shadow-violet-500/30 ring-1 ring-white/20",
          "transition-transform hover:scale-105 active:scale-95",
          "hover:from-violet-500 hover:to-fuchsia-500",
        )}
      >
        {open ? <X className="size-5" /> : <Sparkles className="size-5" />}
      </Button>

      {/* Panel */}
      {open ? (
        <div
          className={cn(
            "fixed bottom-20 right-5 z-40 flex flex-col overflow-hidden rounded-2xl border bg-card",
            "h-[min(620px,74vh)] w-[min(420px,calc(100vw-2.5rem))]",
            "shadow-2xl shadow-black/10 dark:shadow-black/40",
            "origin-bottom-right animate-in fade-in slide-in-from-bottom-3 zoom-in-95 duration-200 motion-reduce:animate-none",
          )}
        >
          <header className="flex items-center gap-2.5 border-b bg-gradient-to-r from-violet-500/10 to-fuchsia-500/10 px-3 py-2.5">
            <span className="grid size-8 shrink-0 place-items-center rounded-full bg-gradient-to-br from-violet-500 to-fuchsia-500 text-white shadow-sm shadow-violet-500/30">
              <Sparkles className="size-4" />
            </span>
            <div className="min-w-0">
              <div className="text-sm font-semibold leading-tight">{AI_ASSISTANT_NAME}</div>
              <div className="text-[11px] text-muted-foreground">Your service desk copilot</div>
            </div>
            <Button type="button" variant="ghost" size="icon-sm" className="ml-auto" onClick={() => setOpen(false)} aria-label="Close">
              <X className="size-4" />
            </Button>
          </header>

          <div ref={scrollRef} className="flex-1 space-y-4 overflow-y-auto p-4">
            {messages.length === 0 ? (
              <div className="flex min-h-full flex-col items-center justify-center gap-3 px-4 text-center">
                <span className="grid size-12 place-items-center rounded-2xl bg-gradient-to-br from-violet-500/15 to-fuchsia-500/15 text-violet-500 ring-1 ring-violet-500/20">
                  <Sparkles className="size-6" />
                </span>
                <p className="max-w-[16rem] text-sm leading-relaxed text-muted-foreground">
                  Ask me about this ticket. I can search the knowledge base, past tickets, and the web, and I cite my sources.
                </p>
                <div className="flex flex-wrap justify-center gap-1.5">
                  {SUGGESTIONS.map((s) => (
                    <button
                      key={s}
                      type="button"
                      onClick={() => sendText(s)}
                      className="rounded-full border border-violet-500/30 bg-violet-500/5 px-2.5 py-1 text-xs text-violet-600 transition-colors hover:bg-violet-500/10 active:scale-95 dark:text-violet-300"
                    >
                      {s}
                    </button>
                  ))}
                </div>
              </div>
            ) : null}

            {messages.map((m, i) =>
              m.role === "user" ? (
                <div key={i} className="ml-auto max-w-[85%] rounded-2xl rounded-br-md bg-primary px-3.5 py-2 text-[13px] leading-relaxed text-primary-foreground shadow-sm">
                  {m.content}
                </div>
              ) : (
                <div key={i} className="flex max-w-[96%] gap-2">
                  <span className="mt-0.5 grid size-7 shrink-0 place-items-center rounded-full bg-gradient-to-br from-violet-500 to-fuchsia-500 text-white shadow-sm shadow-violet-500/30">
                    <Sparkles className="size-3.5" />
                  </span>
                  <div className="min-w-0">
                    {(() => {
                      const chips = (m.tools ?? []).filter((t) => !t.name.startsWith("propose_"));
                      return chips.length ? (
                        <div className="mb-1 flex flex-wrap gap-1">
                          {chips.map((t, j) => (
                            <span
                              key={j}
                              className="inline-flex items-center gap-1 rounded-full bg-violet-500/10 px-1.5 py-0.5 text-[10px] font-medium text-violet-600 dark:text-violet-300"
                            >
                              <Globe className="size-2.5" /> {toolLabel(t.name)}
                            </span>
                          ))}
                        </div>
                      ) : null;
                    })()}
                    {m.error ? (
                      <div className="flex items-start gap-1.5 rounded-2xl rounded-tl-sm border border-destructive/30 bg-destructive/5 px-3 py-1.5 text-sm text-destructive">
                        <AlertTriangle className="mt-0.5 size-3.5 shrink-0" /> <span>{m.content}</span>
                      </div>
                    ) : (
                      <div
                        className={cn(
                          "rounded-2xl rounded-tl-md bg-muted/60 px-3.5 py-2 text-[13px] leading-relaxed",
                          "prose prose-sm max-w-none dark:prose-invert",
                          "prose-p:my-1.5 prose-p:leading-relaxed prose-headings:my-2 prose-ul:my-1.5 prose-ol:my-1.5 prose-li:my-0.5",
                          "prose-a:font-medium prose-a:text-violet-600 dark:prose-a:text-violet-400",
                          "prose-pre:my-2 prose-pre:overflow-x-auto prose-pre:rounded-md prose-pre:bg-muted prose-pre:p-2 prose-pre:text-xs",
                          "prose-code:rounded prose-code:bg-muted prose-code:px-1 prose-code:text-[0.85em] prose-code:before:content-none prose-code:after:content-none",
                        )}
                        dangerouslySetInnerHTML={{ __html: m.html ?? "" }}
                      />
                    )}

                    {m.proposals?.length ? (
                      <div className="mt-2 grid gap-1.5">
                        {m.proposals.map((p) => {
                          const key = `${i}:${p.id}`;
                          const st = proposalState[key]?.status ?? "idle";
                          const msg = proposalState[key]?.msg;
                          return (
                            <div key={p.id} className="rounded-lg border border-violet-500/30 bg-violet-500/[0.06] p-2">
                              <div className="flex items-start gap-1.5">
                                <Wand2 className="mt-0.5 size-3.5 shrink-0 text-violet-500" />
                                <div className="min-w-0 text-sm">
                                  <div className="font-medium leading-snug">{p.label}</div>
                                  {p.kind === "update_field" && p.reason ? (
                                    <div className="text-xs text-muted-foreground">{p.reason}</div>
                                  ) : null}
                                  {p.kind === "internal_note" ? (
                                    <div className="mt-0.5 line-clamp-3 whitespace-pre-wrap text-xs text-muted-foreground">{p.text}</div>
                                  ) : null}
                                </div>
                              </div>
                              <div className="mt-1.5 flex items-center gap-1.5">
                                {st === "applied" ? (
                                  <span className="inline-flex items-center gap-1 text-xs font-medium text-emerald-600 dark:text-emerald-400">
                                    <Check className="size-3.5" /> {msg ?? "Applied"}
                                  </span>
                                ) : st === "dismissed" ? (
                                  <span className="text-xs text-muted-foreground">Dismissed</span>
                                ) : (
                                  <>
                                    <Button type="button" size="xs" onClick={() => approveProposal(key, p)} disabled={st === "applying"}>
                                      {st === "applying" ? <Loader2 className="size-3.5 animate-spin" /> : <Check className="size-3.5" />} Approve
                                    </Button>
                                    <Button
                                      type="button"
                                      size="xs"
                                      variant="ghost"
                                      disabled={st === "applying"}
                                      onClick={() => setProposalState((s) => ({ ...s, [key]: { status: "dismissed" } }))}
                                    >
                                      Dismiss
                                    </Button>
                                    {st === "error" && msg ? <span className="text-xs text-destructive">{msg}</span> : null}
                                  </>
                                )}
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    ) : null}
                  </div>
                </div>
              ),
            )}

            {pending ? (
              <div className="flex items-center gap-2">
                <span className="grid size-6 shrink-0 place-items-center rounded-full bg-gradient-to-br from-violet-500 to-fuchsia-500 text-white">
                  <Sparkles className="size-3" />
                </span>
                <div className="rounded-2xl rounded-tl-md bg-muted/60 px-3.5 py-2.5">
                  <TypingDots />
                </div>
              </div>
            ) : null}
          </div>

          <div className="flex items-end gap-1.5 border-t p-2">
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
                  sendText(input);
                }
              }}
              placeholder={teaser ? "Enable AI to chat…" : "Ask the assistant…"}
              rows={1}
              className="max-h-[120px] min-h-9 flex-1 resize-none rounded-xl border border-input bg-transparent p-2 text-sm outline-none transition-colors focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 dark:bg-input/30"
            />
            <Button
              type="button"
              size="icon-sm"
              onClick={() => sendText(input)}
              disabled={pending || !input.trim()}
              aria-label="Send"
              className="rounded-xl active:scale-95"
            >
              {pending ? <Loader2 className="size-4 animate-spin" /> : <Send className="size-4" />}
            </Button>
          </div>
        </div>
      ) : null}
    </>
  );
}
