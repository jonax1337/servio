"use client";

import { Sparkles, Wrench, AlertTriangle, FileText, Brain, ChevronRight } from "lucide-react";
import { cn } from "@/lib/utils";
import type { AssistantMessage } from "@/lib/actions/ai-assistant";
import { TypingDots } from "./typing-dots";
import { ProposalCard, type ProposalStatus } from "./proposal-card";

/** Friendly label for a read-tool chip. propose_* tools are filtered out upstream. */
function toolLabel(name: string) {
  switch (name) {
    case "web_search": return "Searched web";
    case "fetch_url": return "Read page";
    case "search_knowledge_base": return "Searched KB";
    case "search_tickets": return "Searched tickets";
    case "search_problems": return "Searched problems";
    case "search_changes": return "Searched changes";
    case "list_my_tickets": return "Checked your tickets";
    case "list_team_tickets": return "Checked team queue";
    case "list_tickets": return "Listed tickets";
    case "get_ticket": return "Read a ticket";
    case "get_statistics": return "Pulled statistics";
    case "get_settings_overview": return "Reviewed settings";
    case "search_people": return "Searched people";
    case "search_groups": return "Searched groups";
    case "search_categories": return "Searched categories";
    case "search_services": return "Searched services";
    default: return name.replace(/_/g, " ");
  }
}

/** A short, human summary of a tool call's arguments, e.g. "status: OPEN · assignee: me". */
function toolDetail(input: unknown): string {
  if (!input || typeof input !== "object") return "";
  const entries = Object.entries(input as Record<string, unknown>).filter(
    ([, v]) =>
      (typeof v === "string" && v.trim() !== "") ||
      typeof v === "number" ||
      typeof v === "boolean",
  );
  if (!entries.length) return "";
  return entries
    .slice(0, 4)
    .map(([k, v]) => `${k}: ${String(v).slice(0, 40)}`)
    .join(" · ");
}

const PROSE = cn(
  "rounded-2xl rounded-tl-md bg-muted/60 px-3.5 py-2 text-[13px] leading-relaxed",
  "prose prose-sm max-w-none dark:prose-invert",
  "prose-p:my-1.5 prose-p:leading-relaxed prose-headings:my-2 prose-ul:my-1.5 prose-ol:my-1.5 prose-li:my-0.5",
  "prose-a:font-medium prose-a:text-violet-600 dark:prose-a:text-violet-400",
  "prose-pre:my-2 prose-pre:overflow-x-auto prose-pre:rounded-md prose-pre:bg-muted prose-pre:p-2 prose-pre:text-xs",
  "prose-code:rounded prose-code:bg-muted prose-code:px-1 prose-code:text-[0.85em] prose-code:before:content-none prose-code:after:content-none",
  "prose-table:my-2 prose-table:text-xs prose-th:px-2 prose-th:py-1 prose-td:px-2 prose-td:py-1",
);

/** Renders the ordered list of chat turns plus the "typing" placeholder. */
export function MessageList({
  conversationId,
  messages,
  pending,
  proposalState,
  onProposalStatusChange,
}: {
  conversationId: string;
  messages: AssistantMessage[];
  pending: boolean;
  proposalState: Record<string, ProposalStatus>;
  onProposalStatusChange: (key: string, next: ProposalStatus) => void;
}) {
  return (
    <>
      {messages.map((m, i) =>
        m.role === "user" ? (
          <div key={i} className="ml-auto flex max-w-[85%] flex-col items-end gap-1.5">
            {m.attachments?.length ? (
              <div className="flex flex-wrap justify-end gap-1.5">
                {m.attachments.map((a, j) =>
                  a.kind === "image" && a.dataUrl ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      key={j}
                      src={a.dataUrl}
                      alt={a.name}
                      className="size-24 rounded-xl border object-cover shadow-sm"
                    />
                  ) : (
                    <span
                      key={j}
                      className="inline-flex max-w-52 items-center gap-1.5 rounded-xl border bg-muted/60 py-1.5 pl-2 pr-2.5 text-xs"
                    >
                      <FileText className="size-3.5 shrink-0 text-violet-500" />
                      <span className="truncate">{a.name}</span>
                    </span>
                  ),
                )}
              </div>
            ) : null}
            {m.content ? (
              <div className="rounded-2xl rounded-br-md bg-primary px-3.5 py-2 text-[13px] leading-relaxed whitespace-pre-wrap text-primary-foreground shadow-sm">
                {m.content}
              </div>
            ) : null}
          </div>
        ) : (
          <div key={i} className="flex max-w-[96%] gap-2">
            <span className="mt-0.5 grid size-7 shrink-0 place-items-center rounded-full bg-gradient-to-br from-violet-500 to-fuchsia-500 text-white shadow-sm shadow-violet-500/30">
              <Sparkles className="size-3.5" />
            </span>
            <div className="min-w-0">
              {(() => {
                const steps = (m.toolCalls ?? []).filter((t) => !t.name.startsWith("propose_"));
                return steps.length ? (
                  <div className="mb-1.5 space-y-0.5 rounded-xl border border-border/50 bg-muted/20 px-2.5 py-1.5">
                    {steps.map((t, j) => {
                      const detail = toolDetail(t.input);
                      return (
                        <div key={j} className="flex items-center gap-1.5 text-[11px] leading-relaxed">
                          <Wrench className="size-3 shrink-0 text-violet-500" />
                          <span className="font-medium text-foreground/80">{toolLabel(t.name)}</span>
                          {detail ? (
                            <span className="truncate text-muted-foreground">· {detail}</span>
                          ) : null}
                        </div>
                      );
                    })}
                  </div>
                ) : null;
              })()}

              {m.reasoning ? (
                <details className="group mb-1.5 rounded-xl border border-border/60 bg-muted/30 text-xs">
                  <summary className="flex cursor-pointer list-none items-center gap-1.5 px-2.5 py-1.5 font-medium text-muted-foreground transition-colors hover:text-foreground">
                    <Brain className="size-3.5 text-violet-500" />
                    Thought process
                    <ChevronRight className="size-3.5 transition-transform group-open:rotate-90" />
                  </summary>
                  <div className="max-h-72 overflow-y-auto whitespace-pre-wrap border-t border-border/60 px-2.5 py-2 leading-relaxed text-muted-foreground">
                    {m.reasoning}
                  </div>
                </details>
              ) : null}

              {m.error ? (
                <div className="flex items-start gap-1.5 rounded-2xl rounded-tl-sm border border-destructive/30 bg-destructive/5 px-3 py-1.5 text-sm text-destructive">
                  <AlertTriangle className="mt-0.5 size-3.5 shrink-0" /> <span>{m.content}</span>
                </div>
              ) : (
                <div
                  className={PROSE}
                  dangerouslySetInnerHTML={{ __html: m.html ?? "" }}
                />
              )}

              {m.proposals?.length ? (
                <div className="mt-2 grid gap-1.5">
                  {m.proposals.map((p) => {
                    const key = `${i}:${p.id}`;
                    return (
                      <ProposalCard
                        key={p.id}
                        conversationId={conversationId}
                        proposal={p}
                        status={proposalState[key] ?? { status: "idle" }}
                        onStatusChange={(next) => onProposalStatusChange(key, next)}
                      />
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
    </>
  );
}
