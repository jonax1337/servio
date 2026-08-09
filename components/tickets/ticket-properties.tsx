"use client";

import { useState, useTransition } from "react";
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

/** AI triage — suggest priority/team/category, then apply via updateTicketField
 *  (the same path the manual Combobox uses, so guards + revalidation still run). */
function AiTriagePanel({
  ticketId,
  groupName,
  catName,
  teaser = false,
}: {
  ticketId: number;
  groupName: (id: string) => string;
  catName: (id: string) => string;
  teaser?: boolean;
}) {
  const [pending, start] = useTransition();
  const [sugg, setSugg] = useState<Extract<TriageState, { ok: true }> | null>(null);

  function suggest() {
    if (teaser) return void toast.info(AI_TEASER_MESSAGE);
    start(async () => {
      const res = await suggestTriage(ticketId);
      if (!res.ok) return void toast.error(res.error);
      setSugg(res);
    });
  }

  function fieldData(field: "priority" | "groupId" | "categoryId", value: string) {
    const fd = new FormData();
    fd.set("id", String(ticketId));
    fd.set("field", field);
    fd.set("value", value);
    return fd;
  }

  function applyAll() {
    if (!sugg) return;
    const s = sugg;
    // Await the writes sequentially in one transition so ordering is deterministic
    // (groupId runs auto-assign/automations, same as the manual Team combobox) and
    // success is reported only after they actually complete.
    start(async () => {
      await updateTicketField(fieldData("priority", s.priority));
      if (s.groupId) await updateTicketField(fieldData("groupId", s.groupId));
      if (s.categoryId) await updateTicketField(fieldData("categoryId", s.categoryId));
      toast.success("Suggestion applied");
      setSugg(null);
    });
  }

  if (!sugg) {
    return (
      <AiButton onClick={suggest} disabled={pending} className="w-full">
        {pending ? <Loader2 className="size-4 animate-spin" /> : <Sparkles className="size-4" />}
        AI Triage
      </AiButton>
    );
  }

  return (
    <div className="grid gap-2 rounded-lg border border-violet-500/30 bg-violet-500/5 p-3 text-sm">
      <div className="flex items-center gap-1.5 font-medium text-violet-600 dark:text-violet-300">
        <Sparkles className="size-4" /> Suggested triage
      </div>
      <div className="text-muted-foreground">
        Priority <b className="text-foreground">{sugg.priority}</b>
        {sugg.groupId ? <> · Team <b className="text-foreground">{groupName(sugg.groupId)}</b></> : null}
        {sugg.categoryId ? <> · Category <b className="text-foreground">{catName(sugg.categoryId)}</b></> : null}
      </div>
      {sugg.reasoning ? <p className="text-xs text-muted-foreground">{sugg.reasoning}</p> : null}
      <div className="flex gap-2">
        <Button size="sm" onClick={applyAll} disabled={pending}>Apply all</Button>
        <Button size="sm" variant="ghost" onClick={() => setSugg(null)} disabled={pending}>Dismiss</Button>
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
        <AiTriagePanel ticketId={ticket.id} groupName={groupName} catName={catName} teaser={aiTeaser} />
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
