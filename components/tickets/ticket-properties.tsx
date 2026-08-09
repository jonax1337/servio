"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import { Sparkles, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { updateTicketField } from "@/lib/actions/tickets";
import { suggestTriage, type TriageState } from "@/lib/actions/ai";
import { Button } from "@/components/ui/button";
import { Combobox, type ComboOption } from "@/components/combobox";
import { PendingReasonDialog } from "@/components/tickets/pending-reason-dialog";
import { ResolutionDialog } from "@/components/tickets/resolution-dialog";
import {
  TICKET_STATUSES,
  PRIORITIES,
  IMPACT_URGENCY,
  TICKET_STATUS_META,
  PRIORITY_META,
  LEVEL_META,
  AI_ASSISTANT_NAME,
} from "@/lib/constants";
import type { FormOptions } from "@/lib/data/options";

/** Editable fields staged in the local draft (saved together via "Save changes"). */
type DraftKey = "priority" | "impact" | "urgency" | "assigneeId" | "groupId" | "categoryId" | "serviceId";
const DRAFT_KEYS: DraftKey[] = ["priority", "impact", "urgency", "assigneeId", "groupId", "categoryId", "serviceId"];

function initials(s: string) {
  return s.split(" ").map((p) => p[0]).slice(0, 2).join("").toUpperCase();
}

type Suggestion = { value: string; label: string };

/** A single property: staged combobox with dirty highlight + optional inline Vio suggestion. */
function EditProp({
  label, value, options, searchable, placeholder, dirty, pending, suggestion, onChange, onApply, onDismiss,
}: {
  label: string;
  value: string;
  options: ComboOption[];
  searchable?: boolean;
  placeholder?: string;
  dirty: boolean;
  pending: boolean;
  suggestion: Suggestion | null;
  onChange: (v: string) => void;
  onApply: () => void;
  onDismiss: () => void;
}) {
  return (
    <div className="grid gap-1.5">
      <span className="flex items-center gap-1.5 text-xs font-medium text-muted-foreground">
        {label}
        {dirty ? <span className="size-1.5 rounded-full bg-amber-500" title="Unsaved change" /> : null}
      </span>
      <Combobox
        options={options}
        value={value}
        pending={pending}
        placeholder={placeholder}
        searchPlaceholder={searchable ? `Search ${label.toLowerCase()}…` : "Filter…"}
        onChange={onChange}
        className={cn(
          suggestion && "border-violet-500/40 ring-2 ring-violet-500/40",
          !suggestion && dirty && "border-amber-500/40 ring-2 ring-amber-500/40",
        )}
      />
      {suggestion ? (
        <div className="flex items-center gap-1 rounded-md border border-violet-500/25 bg-violet-500/[0.06] px-2 py-1">
          <Sparkles className="size-3 shrink-0 text-violet-500" />
          <span className="min-w-0 flex-1 truncate text-xs text-violet-600 dark:text-violet-300">
            {AI_ASSISTANT_NAME}: {suggestion.label}
          </span>
          <Button type="button" size="xs" className="h-5 shrink-0 px-1.5" onClick={onApply}>Apply</Button>
          <Button type="button" size="xs" variant="ghost" className="h-5 shrink-0 px-1.5 text-muted-foreground" onClick={onDismiss}>
            Dismiss
          </Button>
        </div>
      ) : null}
    </div>
  );
}

export function TicketProperties({
  ticket,
  options,
  aiEnabled = false,
  aiTeaser = false,
}: {
  ticket: {
    id: number;
    status: string;
    priority: string;
    impact: string;
    urgency: string;
    assigneeId: string | null;
    groupId: string | null;
    queueId: string | null;
    categoryId: string | null;
    serviceId: string | null;
  };
  options: FormOptions;
  aiEnabled?: boolean;
  aiTeaser?: boolean;
}) {
  // ── Options ──
  const statusOpts: ComboOption[] = TICKET_STATUSES.map((s) => ({
    value: s, label: TICKET_STATUS_META[s].label, tone: TICKET_STATUS_META[s].tone, icon: TICKET_STATUS_META[s].icon,
  }));
  const prioOpts: ComboOption[] = PRIORITIES.map((p) => ({
    value: p, label: PRIORITY_META[p].label, tone: PRIORITY_META[p].tone, icon: PRIORITY_META[p].icon,
  }));
  const levelOpts: ComboOption[] = IMPACT_URGENCY.map((l) => ({ value: l, label: LEVEL_META[l].label, tone: LEVEL_META[l].tone }));
  const none = (label: string): ComboOption => ({ value: "none", label });
  const agentOpts: ComboOption[] = [
    none("Unassigned"),
    ...options.agents.map((a) => ({ value: a.id, label: a.name ?? a.email, avatar: initials(a.name ?? a.email), hint: a.email })),
  ];
  const groupOpts: ComboOption[] = [none("No team"), ...options.groups.map((g) => ({ value: g.id, label: g.name }))];
  const catOpts: ComboOption[] = [none("No category"), ...options.categories.map((c) => ({ value: c.id, label: c.name }))];
  const svcOpts: ComboOption[] = [none("No service"), ...options.services.map((s) => ({ value: s.id, label: s.name }))];
  const groupName = (id: string) => options.groups.find((g) => g.id === id)?.name ?? id;
  const catName = (id: string) => options.categories.find((c) => c.id === id)?.name ?? id;

  // ── Draft state (staged edits) vs the saved ticket baseline ──
  const base: Record<DraftKey, string> = {
    priority: ticket.priority,
    impact: ticket.impact,
    urgency: ticket.urgency,
    assigneeId: ticket.assigneeId ?? "none",
    groupId: ticket.groupId ?? "none",
    categoryId: ticket.categoryId ?? "none",
    serviceId: ticket.serviceId ?? "none",
  };
  const [draft, setDraft] = useState<Record<DraftKey, string>>(base);
  const [saving, startSaving] = useTransition();
  const savingRef = useRef(false);

  // Sync the draft when the ticket changes externally (another save, a Vio chat
  // action, etc.). Skipped while we are mid-save so our own writes don't clobber it.
  useEffect(() => {
    if (savingRef.current) return;
    setDraft({
      priority: ticket.priority,
      impact: ticket.impact,
      urgency: ticket.urgency,
      assigneeId: ticket.assigneeId ?? "none",
      groupId: ticket.groupId ?? "none",
      categoryId: ticket.categoryId ?? "none",
      serviceId: ticket.serviceId ?? "none",
    });
  }, [ticket.priority, ticket.impact, ticket.urgency, ticket.assigneeId, ticket.groupId, ticket.categoryId, ticket.serviceId]);

  const dirtyKeys = DRAFT_KEYS.filter((k) => draft[k] !== base[k]);
  const anyDirty = dirtyKeys.length > 0;

  function setField(k: DraftKey, v: string) {
    setDraft((d) => ({ ...d, [k]: v }));
  }

  function saveChanges() {
    const changes = dirtyKeys.map((field) => ({ field, value: draft[field] }));
    if (changes.length === 0) return;
    savingRef.current = true;
    startSaving(async () => {
      try {
        for (const c of changes) {
          const fd = new FormData();
          fd.set("id", String(ticket.id));
          fd.set("field", c.field);
          fd.set("value", c.value);
          await updateTicketField(fd);
        }
        toast.success(`Saved ${changes.length} change${changes.length > 1 ? "s" : ""}`);
      } catch {
        toast.error("Could not save changes.");
      } finally {
        savingRef.current = false;
      }
    });
  }

  function discard() {
    setDraft(base);
    setDismissed(new Set());
  }

  // ── Vio triage suggestions (inline, per field) ──
  const [sugg, setSugg] = useState<Extract<TriageState, { ok: true }> | null>(null);
  const [dismissed, setDismissed] = useState<Set<string>>(new Set());
  const triageStarted = useRef(false);
  useEffect(() => {
    if (!aiEnabled || aiTeaser || triageStarted.current) return;
    triageStarted.current = true;
    suggestTriage(ticket.id).then((res) => { if (res.ok) setSugg(res); }).catch(() => {});
  }, [aiEnabled, aiTeaser, ticket.id]);

  /** Vio's suggestion for a field, if it still differs from the current draft and
   *  is worth showing (empty field to fill, or a value Vio flagged as wrong). */
  function suggestionFor(k: DraftKey): Suggestion | null {
    if (!sugg || dismissed.has(k)) return null;
    const flagged = sugg.flagged ?? [];
    if (k === "priority") {
      if (draft.priority === sugg.priority) return null;
      if (base.priority === "MEDIUM" || flagged.includes("priority")) return { value: sugg.priority, label: PRIORITY_META[sugg.priority].label };
      return null;
    }
    if (k === "groupId") {
      if (!sugg.groupId || draft.groupId === sugg.groupId) return null;
      if (base.groupId === "none" || flagged.includes("groupId")) return { value: sugg.groupId, label: groupName(sugg.groupId) };
      return null;
    }
    if (k === "categoryId") {
      if (!sugg.categoryId || draft.categoryId === sugg.categoryId) return null;
      if (base.categoryId === "none" || flagged.includes("categoryId")) return { value: sugg.categoryId, label: catName(sugg.categoryId) };
      return null;
    }
    return null;
  }

  const prop = (k: DraftKey, label: string, opts: ComboOption[], searchable = false, placeholder?: string) => {
    const suggestion = suggestionFor(k);
    return (
      <EditProp
        label={label}
        value={draft[k]}
        options={opts}
        searchable={searchable}
        placeholder={placeholder}
        dirty={draft[k] !== base[k]}
        pending={saving && draft[k] !== base[k]}
        suggestion={suggestion}
        onChange={(v) => setField(k, v)}
        onApply={() => suggestion && setField(k, suggestion.value)}
        onDismiss={() => setDismissed((s) => new Set(s).add(k))}
      />
    );
  };

  // ── Status stays immediate (its resolution/pending dialogs need notes) ──
  const [statusPending, startStatus] = useTransition();
  const [pendingDlg, setPendingDlg] = useState<{ open: boolean; status: string }>({ open: false, status: "PENDING" });
  const [resDlg, setResDlg] = useState<{ open: boolean; status: string }>({ open: false, status: "RESOLVED" });

  const changeStatus = (v: string) => {
    if (v === "PENDING" || v === "ON_HOLD") return setPendingDlg({ open: true, status: v });
    if (v === "RESOLVED" || v === "CLOSED" || v === "CANCELLED") return setResDlg({ open: true, status: v });
    const fd = new FormData();
    fd.set("id", String(ticket.id));
    fd.set("field", "status");
    fd.set("value", v);
    startStatus(() => updateTicketField(fd));
  };

  return (
    <div className="grid gap-3">
      {/* Status — immediate */}
      <div className="grid gap-1.5">
        <span className="text-xs font-medium text-muted-foreground">Status</span>
        <Combobox options={statusOpts} value={ticket.status} pending={statusPending} onChange={changeStatus} />
      </div>
      <PendingReasonDialog
        ticketId={ticket.id}
        status={pendingDlg.status}
        open={pendingDlg.open}
        onOpenChange={(o) => setPendingDlg((s) => ({ ...s, open: o }))}
      />
      <ResolutionDialog
        ticketId={ticket.id}
        status={resDlg.status}
        open={resDlg.open}
        onOpenChange={(o) => setResDlg((s) => ({ ...s, open: o }))}
      />

      {/* Who owns it */}
      <div className="grid gap-3 border-t pt-3">
        {prop("assigneeId", "Assignee", agentOpts, true, "Unassigned")}
        {prop("groupId", "Team", groupOpts, true, "No team")}
      </div>

      {/* How severe it is */}
      <div className="grid gap-3 border-t pt-3">
        {prop("priority", "Priority", prioOpts)}
        <div className="grid grid-cols-2 gap-3">
          {prop("impact", "Impact", levelOpts)}
          {prop("urgency", "Urgency", levelOpts)}
        </div>
      </div>

      {/* How it's classified */}
      <div className="grid gap-3 border-t pt-3">
        {prop("categoryId", "Category", catOpts, true, "No category")}
        {prop("serviceId", "Service", svcOpts, true, "No service")}
      </div>

      {/* Save bar — only when there are staged changes */}
      {anyDirty ? (
        <div className="sticky bottom-0 -mx-4 flex items-center gap-2 border-t bg-card/95 px-4 pt-2.5 pb-1 backdrop-blur sm:-mx-6 sm:px-6">
          <span className="text-xs text-muted-foreground">
            {dirtyKeys.length} unsaved change{dirtyKeys.length > 1 ? "s" : ""}
          </span>
          <Button type="button" size="sm" variant="ghost" className="ml-auto" onClick={discard} disabled={saving}>
            Discard
          </Button>
          <Button type="button" size="sm" onClick={saveChanges} disabled={saving}>
            {saving ? <Loader2 className="size-3.5 animate-spin" /> : null} Save changes
          </Button>
        </div>
      ) : null}
    </div>
  );
}
