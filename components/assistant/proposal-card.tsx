"use client";

import { useTransition } from "react";
import { Wand2, Check, Loader2, AlertTriangle } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { applyAssistantProposal, type AssistantProposal } from "@/lib/actions/ai-assistant";

export type ProposalStatus = {
  status: "idle" | "applying" | "applied" | "error" | "dismissed";
  msg?: string;
};

/** A compact one-line summary of the proposed change's arguments. */
function proposalDetail(p: AssistantProposal): string | null {
  const entries = Object.entries(p.args ?? {}).filter(
    ([, v]) => v !== undefined && v !== null && String(v).trim() !== "",
  );
  if (!entries.length) return null;
  return entries
    .map(([k, v]) => `${k}: ${typeof v === "string" ? v : JSON.stringify(v)}`)
    .join(" · ");
}

/** Short entity tag derived from the operation id, e.g. "category.create" → "category". */
function opTag(operationId: string): string {
  return (operationId.split(".")[0] || "action").replace(/_/g, " ");
}

/**
 * A single approval card. Approve calls applyAssistantProposal (which
 * re-validates server-side and runs the real action); the result is surfaced
 * inline and via a toast, mirroring the ticket-bound chat.
 */
export function ProposalCard({
  conversationId,
  proposal,
  status,
  onStatusChange,
}: {
  conversationId: string;
  proposal: AssistantProposal;
  status: ProposalStatus;
  onStatusChange: (next: ProposalStatus) => void;
}) {
  const [, startApply] = useTransition();
  const st = status.status;
  const msg = status.msg;
  const detail = proposalDetail(proposal);

  function approve() {
    onStatusChange({ status: "applying" });
    startApply(async () => {
      const res = await applyAssistantProposal({ conversationId, proposal });
      if (res.ok) {
        onStatusChange({ status: "applied", msg: res.applied });
        toast.success(res.applied ?? "Applied");
      } else {
        onStatusChange({ status: "error", msg: res.error });
        toast.error(res.error ?? "Could not apply");
      }
    });
  }

  return (
    <div className="rounded-lg border border-violet-500/30 bg-violet-500/[0.06] p-2">
      <div className="flex items-start gap-1.5">
        <Wand2 className="mt-0.5 size-3.5 shrink-0 text-violet-500" />
        <div className="min-w-0 text-sm">
          <div className="flex items-center gap-1.5">
            <span className="font-medium leading-snug">{proposal.label}</span>
            <span className="rounded-full bg-violet-500/10 px-1.5 py-0.5 text-[10px] font-medium capitalize text-violet-600 dark:text-violet-300">
              {opTag(proposal.operationId)}
            </span>
          </div>
          {detail ? (
            <div className="mt-0.5 line-clamp-3 whitespace-pre-wrap text-xs text-muted-foreground">
              {detail}
            </div>
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
            <Button type="button" size="xs" onClick={approve} disabled={st === "applying"}>
              {st === "applying" ? <Loader2 className="size-3.5 animate-spin" /> : <Check className="size-3.5" />} Approve
            </Button>
            <Button
              type="button"
              size="xs"
              variant="ghost"
              disabled={st === "applying"}
              onClick={() => onStatusChange({ status: "dismissed" })}
            >
              Dismiss
            </Button>
            {st === "error" && msg ? (
              <span className="inline-flex items-center gap-1 text-xs text-destructive">
                <AlertTriangle className="size-3.5" /> {msg}
              </span>
            ) : null}
          </>
        )}
      </div>
    </div>
  );
}
