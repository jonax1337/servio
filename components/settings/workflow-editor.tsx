"use client";

import { useMemo, useState } from "react";
import { useFormStatus } from "react-dom";
import { Loader2, Save, RotateCcw, ArrowRight } from "lucide-react";
import { saveWorkflow, resetWorkflow } from "@/lib/actions/workflows";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { Combobox, type ComboOption } from "@/components/combobox";
import { ToneBadge } from "@/components/status-badge";
import type { Tone } from "@/lib/constants";

type StatusMeta = Record<string, { label: string; tone: Tone }>;
type Override = { fromStatus: string; toStatus: string; allowed: boolean; requiredRole: string | null };
type Rule = { allowed: boolean; role: string }; // role: "none" | "MANAGER" | "ADMIN"

const ROLE_OPTS: ComboOption[] = [
  { value: "none", label: "Anyone" },
  { value: "MANAGER", label: "Manager+" },
  { value: "ADMIN", label: "Admin only" },
];

const key = (from: string, to: string) => `${from}>${to}`;

function SaveButton() {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" size="sm" disabled={pending}>
      {pending ? <Loader2 className="size-4 animate-spin" /> : <Save className="size-4" />}
      Save changes
    </Button>
  );
}

function Badge({ status, meta }: { status: string; meta: StatusMeta }) {
  const m = meta[status] ?? { label: status, tone: "neutral" as Tone };
  return <ToneBadge meta={{ label: m.label, tone: m.tone }} icon={false} />;
}

export function WorkflowEditor({
  entityType,
  pairs,
  statusMeta,
  overrides,
}: {
  entityType: string;
  pairs: { from: string; to: string }[];
  statusMeta: StatusMeta;
  overrides: Override[];
}) {
  // Seed rules: every pair defaults to allowed/anyone, then apply overrides.
  const initial = useMemo(() => {
    const m = new Map<string, Rule>();
    for (const p of pairs) m.set(key(p.from, p.to), { allowed: true, role: "none" });
    for (const o of overrides) {
      m.set(key(o.fromStatus, o.toStatus), { allowed: o.allowed, role: o.requiredRole ?? "none" });
    }
    return m;
  }, [pairs, overrides]);

  const [rules, setRules] = useState<Map<string, Rule>>(initial);

  const setRule = (k: string, patch: Partial<Rule>) =>
    setRules((prev) => {
      const next = new Map(prev);
      next.set(k, { ...(next.get(k) ?? { allowed: true, role: "none" }), ...patch });
      return next;
    });

  // Only non-default rules are persisted (disabled, or role-gated).
  const payload: Override[] = pairs
    .map((p) => ({ p, r: rules.get(key(p.from, p.to))! }))
    .filter(({ r }) => !r.allowed || r.role !== "none")
    .map(({ p, r }) => ({ fromStatus: p.from, toStatus: p.to, allowed: r.allowed, requiredRole: r.role === "none" ? null : r.role }));

  // Group transitions by their source status for a readable layout.
  const byFrom = useMemo(() => {
    const g = new Map<string, { from: string; to: string }[]>();
    for (const p of pairs) {
      if (!g.has(p.from)) g.set(p.from, []);
      g.get(p.from)!.push(p);
    }
    return [...g.entries()];
  }, [pairs]);

  return (
    <form action={saveWorkflow} className="grid gap-4">
      <input type="hidden" name="entityType" value={entityType} />
      <input type="hidden" name="overrides" value={JSON.stringify(payload)} />

      <div className="grid gap-4">
        {byFrom.map(([from, tos]) => (
          <div key={from} className="rounded-lg border bg-card/40 p-3">
            <div className="mb-2 flex items-center gap-2 text-xs font-medium text-muted-foreground">
              <span>From</span>
              <Badge status={from} meta={statusMeta} />
            </div>
            <div className="grid gap-1.5">
              {tos.map(({ to }) => {
                const k = key(from, to);
                const r = rules.get(k) ?? { allowed: true, role: "none" };
                return (
                  <div
                    key={to}
                    className={`flex flex-wrap items-center gap-3 rounded-md px-2 py-1.5 ${r.allowed ? "" : "opacity-50"}`}
                  >
                    <Switch checked={r.allowed} onCheckedChange={(v) => setRule(k, { allowed: v })} />
                    <ArrowRight className="size-3.5 text-muted-foreground" />
                    <div className="min-w-0 flex-1">
                      <Badge status={to} meta={statusMeta} />
                    </div>
                    <div className="w-40 shrink-0">
                      <Combobox
                        options={ROLE_OPTS}
                        value={r.role}
                        disabled={!r.allowed}
                        onChange={(v) => setRule(k, { role: v })}
                        size="sm"
                      />
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        ))}
      </div>

      <div className="flex items-center justify-between gap-2 border-t pt-3">
        <Button
          type="submit"
          formAction={resetWorkflow}
          variant="ghost"
          size="sm"
          className="text-muted-foreground"
        >
          <RotateCcw className="size-4" /> Reset to defaults
        </Button>
        <SaveButton />
      </div>
    </form>
  );
}
