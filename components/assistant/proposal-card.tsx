"use client";

import { useTransition } from "react";
import { Wand2, Check, Loader2, AlertTriangle, Paperclip } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { applyAssistantProposal, type AssistantProposal } from "@/lib/actions/ai-assistant";

export type ProposalStatus = {
  status: "idle" | "applying" | "applied" | "error" | "dismissed";
  msg?: string;
};

/** Args that are plumbing, not user-facing detail — hidden from the card body. */
const HIDDEN_ARGS = new Set(["attachmentIds", "attachFiles"]);

/** The proposed change's arguments as clean [key, value] rows. */
function proposalEntries(p: AssistantProposal): [string, string][] {
  return Object.entries(p.args ?? {})
    .filter(([k, v]) => !HIDDEN_ARGS.has(k) && v !== undefined && v !== null && String(v).trim() !== "")
    .map(([k, v]) => [k, typeof v === "string" ? v : JSON.stringify(v)] as [string, string]);
}

/** How many files this proposal will link to its ticket (0 if none). */
function attachmentCount(p: AssistantProposal): number {
  const ids = (p.args as { attachmentIds?: unknown } | undefined)?.attachmentIds;
  return Array.isArray(ids) ? ids.length : 0;
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
  const entries = proposalEntries(proposal);
  const attachments = attachmentCount(proposal);

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

  const applied = st === "applied";

  return (
    <div
      className={cn(
        "my-1 w-full rounded-xl border bg-card p-3 text-sm shadow-sm transition-colors",
        applied && "border-emerald-500/30 bg-emerald-500/[0.04]",
      )}
    >
      <div className="flex items-center gap-2">
        <span
          className={cn(
            "grid size-6 shrink-0 place-items-center rounded-md",
            applied ? "bg-emerald-500/15 text-emerald-600 dark:text-emerald-400" : "bg-vio-muted text-vio",
          )}
        >
          {applied ? <Check className="size-3.5" /> : <Wand2 className="size-3.5" />}
        </span>
        <span className="min-w-0 flex-1 truncate font-medium">{proposal.label}</span>
        <span className="rounded-md bg-muted px-1.5 py-0.5 text-[10px] font-medium uppercase tracking-wide text-muted-foreground">
          {opTag(proposal.operationId)}
        </span>
      </div>

      {!applied && entries.length ? (
        <dl className="mt-2 grid gap-1 rounded-lg bg-muted/50 p-2 text-xs">
          {entries.slice(0, 6).map(([k, v]) => (
            <div key={k} className="flex gap-2">
              <dt className="shrink-0 text-muted-foreground">{k}</dt>
              <dd className="min-w-0 flex-1 truncate font-medium text-foreground">{v}</dd>
            </div>
          ))}
        </dl>
      ) : null}

      {!applied && attachments > 0 ? (
        <p className="mt-2 flex items-center gap-1.5 text-xs text-muted-foreground">
          <Paperclip className="size-3.5" />
          {attachments} {attachments === 1 ? "attachment" : "attachments"} will be added
        </p>
      ) : null}

      <div className="mt-2.5 flex items-center gap-2">
        {applied ? (
          <span className="inline-flex items-center gap-1.5 text-xs font-medium text-emerald-600 dark:text-emerald-400">
            <Check className="size-3.5" /> {msg ?? "Applied"}
          </span>
        ) : (
          <>
            <Button
              type="button"
              size="sm"
              onClick={approve}
              disabled={st === "applying"}
              className="h-7 gap-1.5 bg-vio px-3 text-vio-foreground hover:bg-vio/90"
            >
              {st === "applying" ? <Loader2 className="size-3.5 animate-spin" /> : <Check className="size-3.5" />}
              Approve
            </Button>
            <Button
              type="button"
              size="sm"
              variant="ghost"
              className="h-7 px-3 text-muted-foreground"
              disabled={st === "applying"}
              onClick={() => onStatusChange({ status: "dismissed" })}
            >
              Dismiss
            </Button>
          </>
        )}
      </div>

      {st === "error" && msg ? (
        <p className="mt-2 flex items-start gap-1.5 rounded-lg bg-destructive/10 px-2 py-1.5 text-xs text-destructive">
          <AlertTriangle className="mt-0.5 size-3.5 shrink-0" />
          <span className="min-w-0">{msg}</span>
        </p>
      ) : null}
    </div>
  );
}
