"use client";

import { createContext, useContext, useState } from "react";
import type { ToolCallMessagePartComponent } from "@assistant-ui/react";
import { ToolFallback } from "@/components/tool-fallback";
import { ProposalCard, type ProposalStatus } from "./proposal-card";
import type { AssistantProposal } from "@/lib/actions/ai-assistant";

/** Provides the active conversation id to proposal cards (for applyAssistantProposal). */
export const SableConversationContext = createContext<string>("");

/* ── Persist approve/dismiss so a proposal can't be re-approved after the thread
 *    re-hydrates (assistant-ui re-renders the tool part as a fresh "idle"). ── */

type Persisted = "applied" | "dismissed";

function propKey(conversationId: string, p: AssistantProposal): string {
  return `sable:prop:${conversationId}::${p.operationId}::${JSON.stringify(p.args)}`;
}
function readState(key: string): Persisted | null {
  try {
    const v = window.localStorage.getItem(key);
    return v === "applied" || v === "dismissed" ? v : null;
  } catch {
    return null;
  }
}
function writeState(key: string, v: Persisted) {
  try {
    window.localStorage.setItem(key, v);
  } catch {
    /* ignore */
  }
}

/**
 * Tool UI for the assistant-ui thread: renders Sable's approve-first
 * `ProposalCard` for `propose_*` write tools (whose result carries the
 * proposal), and falls back to the default tool display for read tools.
 */
export const SableToolUI: ToolCallMessagePartComponent = (props) => {
  if (props.toolName.startsWith("propose_")) {
    const result = props.result as { proposal?: AssistantProposal } | undefined;
    if (result?.proposal) return <ProposalTool proposal={result.proposal} />;
    // Still running / not yet resolved — render nothing (no ugly generic card).
    return null;
  }
  return <ToolFallback {...props} />;
};

function ProposalTool({ proposal }: { proposal: AssistantProposal }) {
  const conversationId = useContext(SableConversationContext);
  const key = propKey(conversationId, proposal);
  const [status, setStatus] = useState<ProposalStatus>(() => {
    const s = readState(key);
    if (s === "applied") return { status: "applied", msg: "Applied" };
    if (s === "dismissed") return { status: "dismissed" };
    return { status: "idle" };
  });

  // Once dismissed, it's gone for good.
  if (status.status === "dismissed") return null;

  return (
    <ProposalCard
      conversationId={conversationId}
      proposal={proposal}
      status={status}
      onStatusChange={(next) => {
        setStatus(next);
        if (next.status === "applied") writeState(key, "applied");
        else if (next.status === "dismissed") writeState(key, "dismissed");
      }}
    />
  );
}
