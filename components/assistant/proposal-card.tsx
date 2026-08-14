"use client";

import { useTransition } from "react";
import {
  ShieldCheck,
  Check,
  Loader2,
  AlertTriangle,
  Paperclip,
  PanelRightOpen,
  X,
} from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { useSable } from "./sable-provider";
import { applyAssistantProposal, type AssistantProposal } from "@/lib/actions/ai-assistant";

export type ProposalStatus = {
  status: "idle" | "applying" | "applied" | "error" | "dismissed";
  msg?: string;
};

/** Args that are plumbing, not user-facing detail — hidden from the card body. */
const HIDDEN_ARGS = new Set(["attachmentIds", "attachFiles"]);

/** Long-form fields worth previewing in the canvas rather than a cramped row. */
const PREVIEW_FIELDS = ["body", "description", "content", "comment", "message", "answer", "resolution"];

/** The first long text field of a proposal, for the "Preview in canvas" affordance. */
function previewable(p: AssistantProposal): { field: string; text: string; isHtml: boolean } | null {
  const args = (p.args ?? {}) as Record<string, unknown>;
  for (const field of PREVIEW_FIELDS) {
    const v = args[field];
    if (typeof v === "string" && v.trim().length >= 120) {
      const isHtml = /<\/(p|div|ul|ol|li|h[1-6]|pre|table|blockquote|strong|em|a|br)>/i.test(v) || /^\s*</.test(v);
      return { field, text: v, isHtml };
    }
  }
  return null;
}

/** The proposed change's arguments as clean [key, value] rows (long body excluded). */
function proposalEntries(p: AssistantProposal, skipField?: string): [string, string][] {
  return Object.entries(p.args ?? {})
    .filter(
      ([k, v]) =>
        !HIDDEN_ARGS.has(k) &&
        k !== skipField &&
        v !== undefined &&
        v !== null &&
        String(v).trim() !== "",
    )
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

/** A crude plain-text snippet from a body (strips tags/markdown noise) for the card. */
function snippet(text: string, isHtml: boolean): string {
  const plain = isHtml ? text.replace(/<[^>]+>/g, " ") : text.replace(/[#*`>_-]{1,}/g, " ");
  return plain.replace(/\s+/g, " ").trim().slice(0, 180);
}

/**
 * A single approval card — Sable's approve-first write flow, styled to feel like
 * a first-class, human-in-the-loop approval (not a debug dump). Approve calls
 * `applyAssistantProposal`, which re-checks RBAC + re-validates the args
 * server-side and runs the real action; nothing mutates until the user approves.
 * Content-heavy proposals (a KB-article body, a long comment) get a "Preview"
 * that opens the full body read-only in the canvas.
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
  const { openCanvas } = useSable();
  const [, startApply] = useTransition();
  const st = status.status;
  const msg = status.msg;
  const preview = previewable(proposal);
  const entries = proposalEntries(proposal, preview?.field);
  const attachments = attachmentCount(proposal);
  const applied = st === "applied";
  const busy = st === "applying";

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

  function openPreview() {
    if (!preview) return;
    openCanvas({
      title: proposal.label,
      markdown: preview.isHtml ? "" : preview.text,
      html: preview.isHtml ? preview.text : undefined,
      preview: true,
    });
  }

  return (
    <div
      className={cn(
        "my-1.5 w-full overflow-hidden rounded-xl border bg-card text-sm shadow-sm ring-1 ring-transparent transition-colors",
        applied
          ? "border-emerald-500/30"
          : st === "error"
            ? "border-destructive/30"
            : "border-border hover:ring-sable/15",
      )}
    >
      {/* Header — the action + an "approval" affordance, on a tinted strip. */}
      <div
        className={cn(
          "flex items-center gap-2 px-3 py-2",
          applied ? "bg-emerald-500/[0.06]" : "bg-sable-muted/40",
        )}
      >
        <span
          className={cn(
            "grid size-6 shrink-0 place-items-center rounded-md",
            applied
              ? "bg-emerald-500/15 text-emerald-600 dark:text-emerald-400"
              : "bg-sable text-sable-foreground",
          )}
        >
          {applied ? <Check className="size-3.5" /> : <ShieldCheck className="size-3.5" />}
        </span>
        <div className="min-w-0 flex-1">
          <p className="text-[10px] font-medium uppercase tracking-wide text-muted-foreground">
            {applied ? "Applied" : "Approval required"}
          </p>
          <p className="truncate font-medium leading-tight text-foreground">{proposal.label}</p>
        </div>
        <span className="shrink-0 rounded-md bg-background/70 px-1.5 py-0.5 text-[10px] font-medium uppercase tracking-wide text-muted-foreground">
          {opTag(proposal.operationId)}
        </span>
      </div>

      {!applied ? (
        <div className="flex flex-col gap-2 p-3">
          {entries.length ? (
            <dl className="grid gap-1 rounded-lg bg-muted/50 p-2 text-xs">
              {entries.slice(0, 6).map(([k, v]) => (
                <div key={k} className="flex gap-2">
                  <dt className="w-20 shrink-0 truncate text-muted-foreground">{k}</dt>
                  <dd className="min-w-0 flex-1 truncate font-medium text-foreground">{v}</dd>
                </div>
              ))}
            </dl>
          ) : null}

          {preview ? (
            <button
              type="button"
              onClick={openPreview}
              className="group/preview flex items-start gap-2 rounded-lg border border-dashed border-border/70 bg-muted/30 p-2 text-left text-xs transition-colors hover:border-sable/40 hover:bg-sable-muted/30"
            >
              <span className="mt-0.5 line-clamp-2 min-w-0 flex-1 text-muted-foreground">
                {snippet(preview.text, preview.isHtml)}…
              </span>
              <span className="mt-0.5 inline-flex shrink-0 items-center gap-1 font-medium text-sable">
                <PanelRightOpen className="size-3.5" />
                Preview
              </span>
            </button>
          ) : null}

          {attachments > 0 ? (
            <p className="flex items-center gap-1.5 text-xs text-muted-foreground">
              <Paperclip className="size-3.5" />
              {attachments} {attachments === 1 ? "attachment" : "attachments"} will be added
            </p>
          ) : null}

          {st === "error" && msg ? (
            <p className="flex items-start gap-1.5 rounded-lg bg-destructive/10 px-2 py-1.5 text-xs text-destructive">
              <AlertTriangle className="mt-0.5 size-3.5 shrink-0" />
              <span className="min-w-0">{msg}</span>
            </p>
          ) : null}

          <div className="flex items-center gap-1.5">
            <Button
              type="button"
              size="sm"
              onClick={approve}
              disabled={busy}
              className="h-8 flex-1 gap-1.5 bg-sable text-sable-foreground hover:bg-sable/90"
            >
              {busy ? <Loader2 className="size-3.5 animate-spin" /> : <Check className="size-3.5" />}
              {st === "error" ? "Retry approve" : "Approve"}
            </Button>
            {preview ? (
              <Button
                type="button"
                size="sm"
                variant="outline"
                className="h-8 gap-1.5"
                disabled={busy}
                onClick={openPreview}
              >
                <PanelRightOpen className="size-3.5" />
                Preview
              </Button>
            ) : null}
            <Button
              type="button"
              size="sm"
              variant="ghost"
              className="h-8 gap-1.5 text-muted-foreground"
              disabled={busy}
              onClick={() => onStatusChange({ status: "dismissed" })}
            >
              <X className="size-3.5" />
              Dismiss
            </Button>
          </div>
        </div>
      ) : (
        <div className="flex items-center gap-1.5 px-3 py-2 text-xs font-medium text-emerald-600 dark:text-emerald-400">
          <Check className="size-3.5" /> {msg ?? "Applied"}
        </div>
      )}
    </div>
  );
}
