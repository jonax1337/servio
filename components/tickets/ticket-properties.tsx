"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import { Sparkles, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { updateTicketField } from "@/lib/actions/tickets";
import { suggestTriage, type TriageState } from "@/lib/actions/ai";
import { Button } from "@/components/ui/button";
import { AiButton } from "@/components/ui/ai-button";
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
  AI_TEASER_MESSAGE,
  AI_ASSISTANT_NAME,
} from "@/lib/constants";
import type { FormOptions } from "@/lib/data/options";

type Field =
  | "status" | "priority" | "impact" | "urgency"
  | "assigneeId" | "groupId" | "queueId" | "categoryId" | "serviceId";

function initials(s: string) {
  return s.split(" ").map((p) => p[0]).slice(0, 2).join("").toUpperCase();
}

function Prop({
  label, ticketId, field, value, options, searchable, placeholder,
}: {
  label: string;
  ticketId: number;
  field: Field;
  value: string | null;
  options: ComboOption[];
  searchable?: boolean;
  placeholder?: string;
}) {
  const [pending, start] = useTransition();
  return (
    <div className="grid gap-1.5">
      <span className="text-xs font-medium text-muted-foreground">{label}</span>
      <Combobox
        options={options}
        value={value ?? "none"}
        pending={pending}
        placeholder={placeholder}
        searchPlaceholder={searchable ? `Search ${label.toLowerCase()}…` : "Filter…"}
        onChange={(v) => {
          const fd = new FormData();
          fd.set("id", String(ticketId));
          fd.set("field", field);
          fd.set("value", v);
          start(() => updateTicketField(fd));
        }}
      />
    </div>
  );
}

type TriageField = "priority" | "groupId" | "categoryId";
type TriageItem = { field: TriageField; value: string; label: string; kind: "fill" | "fix" };

/** Proactive AI triage — only shown when Team/Category are still empty. Fetches a
 *  suggestion automatically on mount and lets the agent apply each empty field
 *  (via updateTicketField, the same path the manual Combobox uses). */
function AiTriagePanel({
  ticketId,
  priority,
  groupId,
  categoryId,
  groupName,
  catName,
  teaser = false,
}: {
  ticketId: number;
  priority: string;
  groupId: string | null;
  categoryId: string | null;
  groupName: (id: string) => string;
  catName: (id: string) => string;
  teaser?: boolean;
}) {
  const [pending, start] = useTransition();
  const [sugg, setSugg] = useState<Extract<TriageState, { ok: true }> | null>(null);
  const [failed, setFailed] = useState(false);
  const [errMsg, setErrMsg] = useState<string | null>(null);
  const started = useRef(false);

  function fetchSuggestion() {
    setFailed(false);
    setErrMsg(null);
    start(async () => {
      const res = await suggestTriage(ticketId);
      if (!res.ok) { setErrMsg(res.error); setFailed(true); return; }
      setSugg(res);
    });
  }

  // Proactively analyse on mount — no click needed. Skip in teaser mode.
  useEffect(() => {
    if (teaser || started.current) return;
    started.current = true;
    fetchSuggestion();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [teaser, ticketId]);

  // Offer fields that are empty ("fill") plus already-set fields the AI flagged
  // as clearly wrong ("fix", shown as current → suggested).
  const items: TriageItem[] = [];
  if (sugg) {
    const flagged = sugg.flagged ?? [];
    if (sugg.priority !== priority) {
      if (priority === "MEDIUM")
        items.push({ field: "priority", value: sugg.priority, label: `Priority: ${sugg.priority}`, kind: "fill" });
      else if (flagged.includes("priority"))
        items.push({ field: "priority", value: sugg.priority, label: `Priority: ${priority} → ${sugg.priority}`, kind: "fix" });
    }
    if (sugg.groupId && sugg.groupId !== groupId) {
      if (!groupId)
        items.push({ field: "groupId", value: sugg.groupId, label: `Team: ${groupName(sugg.groupId)}`, kind: "fill" });
      else if (flagged.includes("groupId"))
        items.push({ field: "groupId", value: sugg.groupId, label: `Team: ${groupName(groupId)} → ${groupName(sugg.groupId)}`, kind: "fix" });
    }
    if (sugg.categoryId && sugg.categoryId !== categoryId) {
      if (!categoryId)
        items.push({ field: "categoryId", value: sugg.categoryId, label: `Category: ${catName(sugg.categoryId)}`, kind: "fill" });
      else if (flagged.includes("categoryId"))
        items.push({ field: "categoryId", value: sugg.categoryId, label: `Category: ${catName(categoryId)} → ${catName(sugg.categoryId)}`, kind: "fix" });
    }
  }

  function fieldData(field: TriageField, value: string) {
    const fd = new FormData();
    fd.set("id", String(ticketId));
    fd.set("field", field);
    fd.set("value", value);
    return fd;
  }

  function applyOne(it: TriageItem) {
    start(async () => {
      await updateTicketField(fieldData(it.field, it.value));
      toast.success(`${it.label} applied`);
    });
  }

  function applyAll() {
    const toApply = items;
    start(async () => {
      try {
        for (const it of toApply) await updateTicketField(fieldData(it.field, it.value));
        toast.success(`Applied ${AI_ASSISTANT_NAME}'s suggestions`);
        setSugg(null);
      } catch {
        toast.error("Could not apply all suggestions.");
      }
    });
  }

  if (teaser) {
    return (
      <AiButton onClick={() => toast.info(AI_TEASER_MESSAGE)} className="w-full">
        <Sparkles className="size-4" /> {AI_ASSISTANT_NAME} Triage
      </AiButton>
    );
  }

  if (pending && !sugg) {
    return (
      <div className="flex items-center gap-2 rounded-xl border border-violet-500/25 bg-violet-500/5 px-3 py-2.5 text-xs text-violet-600 dark:text-violet-300">
        <span className="grid size-5 shrink-0 place-items-center rounded-full bg-gradient-to-br from-violet-500 to-fuchsia-500 text-white">
          <Loader2 className="size-3 animate-spin" />
        </span>
        {AI_ASSISTANT_NAME} is analysing this ticket…
      </div>
    );
  }

  if (failed) {
    return (
      <div className="grid gap-1.5">
        <AiButton onClick={fetchSuggestion} disabled={pending} className="w-full">
          {pending ? <Loader2 className="size-4 animate-spin" /> : <Sparkles className="size-4" />}
          Retry {AI_ASSISTANT_NAME}
        </AiButton>
        {errMsg ? <p className="text-xs text-muted-foreground">{errMsg}</p> : null}
      </div>
    );
  }

  if (!sugg || items.length === 0) return null;

  return (
    <div className="grid min-w-0 gap-2.5 overflow-hidden rounded-xl border border-violet-500/25 bg-gradient-to-br from-violet-500/[0.06] to-fuchsia-500/[0.06] p-3">
      <div className="flex items-center gap-2">
        <span className="grid size-6 shrink-0 place-items-center rounded-full bg-gradient-to-br from-violet-500 to-fuchsia-500 text-white shadow-sm shadow-violet-500/30">
          <Sparkles className="size-3.5" />
        </span>
        <span className="text-xs font-semibold text-violet-600 dark:text-violet-300">{AI_ASSISTANT_NAME} suggests</span>
      </div>
      {sugg.reasoning ? (
        <p className="line-clamp-2 break-words text-xs leading-relaxed text-muted-foreground" title={sugg.reasoning}>
          {sugg.reasoning}
        </p>
      ) : null}
      <div className="grid gap-1.5">
        {items.map((it) => (
          <div
            key={it.field}
            className="flex min-w-0 items-center gap-2 rounded-lg bg-background/70 px-2.5 py-1.5 text-sm ring-1 ring-black/[0.04] dark:ring-white/[0.06]"
          >
            <span className="min-w-0 flex-1 truncate">{it.label}</span>
            {it.kind === "fix" ? (
              <span className="shrink-0 rounded bg-amber-500/15 px-1 py-0.5 text-[10px] font-medium text-amber-600 dark:text-amber-400">
                looks wrong
              </span>
            ) : null}
            <Button type="button" size="xs" className="shrink-0" onClick={() => applyOne(it)} disabled={pending}>Apply</Button>
          </div>
        ))}
      </div>
      <div className="flex items-center gap-2">
        {items.length > 1 ? (
          <Button type="button" size="sm" onClick={applyAll} disabled={pending}>Apply all</Button>
        ) : null}
        <Button type="button" size="sm" variant="ghost" onClick={() => setSugg(null)} disabled={pending} className="ml-auto">
          Dismiss
        </Button>
      </div>
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
  const statusOpts: ComboOption[] = TICKET_STATUSES.map((s) => ({
    value: s, label: TICKET_STATUS_META[s].label, tone: TICKET_STATUS_META[s].tone, icon: TICKET_STATUS_META[s].icon,
  }));
  const prioOpts: ComboOption[] = PRIORITIES.map((p) => ({
    value: p, label: PRIORITY_META[p].label, tone: PRIORITY_META[p].tone, icon: PRIORITY_META[p].icon,
  }));
  const levelOpts: ComboOption[] = IMPACT_URGENCY.map((l) => ({
    value: l, label: LEVEL_META[l].label, tone: LEVEL_META[l].tone,
  }));
  const none = (label: string): ComboOption => ({ value: "none", label });
  const agentOpts: ComboOption[] = [
    none("Unassigned"),
    ...options.agents.map((a) => ({ value: a.id, label: a.name ?? a.email, avatar: initials(a.name ?? a.email), hint: a.email })),
  ];
  const groupOpts: ComboOption[] = [none("No team"), ...options.groups.map((g) => ({ value: g.id, label: g.name }))];
  const catOpts: ComboOption[] = [none("No category"), ...options.categories.map((c) => ({ value: c.id, label: c.name }))];
  const groupName = (id: string) => options.groups.find((g) => g.id === id)?.name ?? id;
  const catName = (id: string) => options.categories.find((c) => c.id === id)?.name ?? id;
  const svcOpts: ComboOption[] = [none("No service"), ...options.services.map((s) => ({ value: s.id, label: s.name }))];

  const [statusPending, startStatus] = useTransition();
  const [pendingDlg, setPendingDlg] = useState<{ open: boolean; status: string }>({ open: false, status: "PENDING" });
  const [resDlg, setResDlg] = useState<{ open: boolean; status: string }>({ open: false, status: "RESOLVED" });

  const changeStatus = (v: string) => {
    if (v === "PENDING" || v === "ON_HOLD") {
      setPendingDlg({ open: true, status: v });
      return;
    }
    if (v === "RESOLVED" || v === "CLOSED" || v === "CANCELLED") {
      setResDlg({ open: true, status: v });
      return;
    }
    const fd = new FormData();
    fd.set("id", String(ticket.id));
    fd.set("field", "status");
    fd.set("value", v);
    startStatus(() => updateTicketField(fd));
  };

  return (
    <div className="grid gap-3">
      {aiEnabled ? (
        <AiTriagePanel
          ticketId={ticket.id}
          priority={ticket.priority}
          groupId={ticket.groupId}
          categoryId={ticket.categoryId}
          groupName={groupName}
          catName={catName}
          teaser={aiTeaser}
        />
      ) : null}

      {/* Status — the primary action */}
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
        <Prop label="Assignee" ticketId={ticket.id} field="assigneeId" value={ticket.assigneeId} options={agentOpts} searchable placeholder="Unassigned" />
        <Prop label="Team" ticketId={ticket.id} field="groupId" value={ticket.groupId} options={groupOpts} searchable placeholder="No team" />
      </div>

      {/* How severe it is */}
      <div className="grid gap-3 border-t pt-3">
        <Prop label="Priority" ticketId={ticket.id} field="priority" value={ticket.priority} options={prioOpts} />
        <div className="grid grid-cols-2 gap-3">
          <Prop label="Impact" ticketId={ticket.id} field="impact" value={ticket.impact} options={levelOpts} />
          <Prop label="Urgency" ticketId={ticket.id} field="urgency" value={ticket.urgency} options={levelOpts} />
        </div>
      </div>

      {/* How it's classified */}
      <div className="grid gap-3 border-t pt-3">
        <Prop label="Category" ticketId={ticket.id} field="categoryId" value={ticket.categoryId} options={catOpts} searchable placeholder="No category" />
        <Prop label="Service" ticketId={ticket.id} field="serviceId" value={ticket.serviceId} options={svcOpts} searchable placeholder="No service" />
      </div>
    </div>
  );
}
