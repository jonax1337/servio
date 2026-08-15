"use client";

import { useActionState, useState } from "react";
import { Plus, Trash2, Loader2, Save, Pencil, SlidersHorizontal } from "lucide-react";
import { createCustomField, updateCustomField, type FieldState } from "@/lib/actions/custom-fields";
import {
  CUSTOM_FIELD_TYPES, CUSTOM_FIELD_TYPE_LABELS, VISIBILITY_FIELDS,
  type CustomFieldDef, type CustomFieldEntity,
} from "@/lib/custom-fields";
import { MATCH_TYPES, OPERATORS, type Condition } from "@/lib/automation-defs";
import {
  TICKET_STATUSES, PRIORITIES, TICKET_TYPES, IMPACT_URGENCY, TICKET_SOURCES,
  PROBLEM_STATUSES, CHANGE_STATUSES, CHANGE_TYPES, RISKS,
  TICKET_STATUS_META, PRIORITY_META, TICKET_TYPE_META, LEVEL_META, SOURCE_META,
  PROBLEM_STATUS_META, CHANGE_STATUS_META, CHANGE_TYPE_META,
} from "@/lib/constants";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Combobox, type ComboOption } from "@/components/combobox";
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger,
} from "@/components/ui/dialog";

const enumOpts = (arr: readonly string[], meta: Record<string, { label: string }>): ComboOption[] =>
  arr.map((v) => ({ value: v, label: meta[v]?.label ?? v }));

// Value options for a visibility condition, keyed by (entity, built-in field).
function conditionValueOptions(entity: CustomFieldEntity, field: string): ComboOption[] | "text" {
  const map: Record<string, ComboOption[] | "text"> = {
    type: entity === "CHANGE" ? enumOpts(CHANGE_TYPES, CHANGE_TYPE_META) : enumOpts(TICKET_TYPES, TICKET_TYPE_META),
    status:
      entity === "PROBLEM"
        ? enumOpts(PROBLEM_STATUSES, PROBLEM_STATUS_META)
        : entity === "CHANGE"
          ? enumOpts(CHANGE_STATUSES, CHANGE_STATUS_META)
          : enumOpts(TICKET_STATUSES, TICKET_STATUS_META),
    priority: enumOpts(PRIORITIES, PRIORITY_META),
    impact: enumOpts(IMPACT_URGENCY, LEVEL_META),
    urgency: enumOpts(IMPACT_URGENCY, LEVEL_META),
    risk: enumOpts(RISKS, LEVEL_META),
    source: enumOpts(TICKET_SOURCES, SOURCE_META),
    categoryId: "text",
  };
  return map[field] ?? "text";
}

function ValuePicker({
  kind, value, onChange,
}: {
  kind: ComboOption[] | "text" | "none";
  value: string;
  onChange: (v: string) => void;
}) {
  if (kind === "none") return <span className="text-xs text-muted-foreground">—</span>;
  if (kind === "text")
    return <Input value={value} onChange={(e) => onChange(e.target.value)} placeholder="value" className="h-8" />;
  return <Combobox options={kind} value={value} onChange={onChange} size="sm" placeholder="value" />;
}

const TYPE_OPTS: ComboOption[] = CUSTOM_FIELD_TYPES.map((t) => ({ value: t, label: CUSTOM_FIELD_TYPE_LABELS[t] }));

function slugPreview(s: string) {
  return s.toLowerCase().trim().replace(/[^a-z0-9]+/g, "_").replace(/^_+|_+$/g, "").slice(0, 48);
}

export function CustomFieldEditor({
  entityType,
  def,
}: {
  entityType: CustomFieldEntity;
  def?: CustomFieldDef;
}) {
  const editing = !!def;
  const [open, setOpen] = useState(false);
  const [state, action, pending] = useActionState<FieldState, FormData>(
    editing ? updateCustomField : createCustomField,
    undefined,
  );

  const [label, setLabel] = useState(def?.label ?? "");
  const [type, setType] = useState(def?.type ?? "text");
  const [required, setRequired] = useState(def?.required ?? false);
  const [placeholder, setPlaceholder] = useState(def?.placeholder ?? "");
  const [help, setHelp] = useState(def?.help ?? "");
  const [options, setOptions] = useState<string[]>(
    def ? tryParse(def.options) : [""],
  );
  const [matchType, setMatchType] = useState(def?.matchType ?? "ALL");
  const [conditions, setConditions] = useState<Condition[]>(def ? tryParseConds(def.visibility) : []);

  const fields = VISIBILITY_FIELDS[entityType];
  const cleanOptions = options.map((o) => o.trim()).filter(Boolean);

  const submit = async (fd: FormData) => {
    await action(fd);
    setOpen(false);
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger
        render={<Button variant={editing ? "outline" : "default"} size={editing ? "icon-sm" : "sm"} aria-label={editing ? "Edit field" : undefined} />}
      >
        {editing ? <Pencil className="size-4" /> : <><Plus className="size-4" /> New field</>}
      </DialogTrigger>
      <DialogContent className="max-h-[85vh] overflow-y-auto sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2"><SlidersHorizontal className="size-4 text-primary" /> {editing ? "Edit" : "New"} custom field</DialogTitle>
          <DialogDescription>Collect extra data on the detail sidebar, shown only when your conditions match.</DialogDescription>
        </DialogHeader>

        <form action={submit} className="grid gap-5">
          {def ? <input type="hidden" name="id" value={def.id} /> : null}
          <input type="hidden" name="entityType" value={entityType} />
          <input type="hidden" name="type" value={type} />
          <input type="hidden" name="required" value={required ? "true" : "false"} />
          <input type="hidden" name="matchType" value={matchType} />
          <input type="hidden" name="options" value={JSON.stringify(cleanOptions)} />
          <input type="hidden" name="visibility" value={JSON.stringify(conditions.filter((c) => c.field))} />

          {state?.error ? (
            <p className="rounded-lg border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive">{state.error}</p>
          ) : null}

          <div className="grid gap-3 sm:grid-cols-2">
            <div className="grid gap-1.5 sm:col-span-2">
              <Label>Label</Label>
              <Input name="label" value={label} onChange={(e) => setLabel(e.target.value)} placeholder="e.g. Cost centre" required />
              {!editing && label ? (
                <p className="text-xs text-muted-foreground">Key: <span className="font-mono">{slugPreview(label) || "field"}</span></p>
              ) : null}
              {editing ? <p className="text-xs text-muted-foreground">Key: <span className="font-mono">{def.key}</span></p> : null}
            </div>
            <div className="grid gap-1.5">
              <Label>Type</Label>
              <Combobox options={TYPE_OPTS} value={type} onChange={(v) => setType(v)} />
            </div>
            <div className="grid gap-1.5">
              <Label>Placeholder</Label>
              <Input name="placeholder" value={placeholder} onChange={(e) => setPlaceholder(e.target.value)} placeholder="Optional" />
            </div>
            <div className="grid gap-1.5 sm:col-span-2">
              <Label>Help text</Label>
              <Input name="help" value={help} onChange={(e) => setHelp(e.target.value)} placeholder="Optional hint shown under the field" />
            </div>
          </div>

          {/* Select options */}
          {type === "select" ? (
            <div className="grid gap-2">
              <div className="flex items-center justify-between">
                <Label>Choices</Label>
                <Button type="button" variant="outline" size="sm" onClick={() => setOptions((o) => [...o, ""])}>
                  <Plus className="size-4" /> Add choice
                </Button>
              </div>
              {options.length === 0 ? (
                <p className="rounded-lg border border-dashed p-3 text-center text-xs text-muted-foreground">Add at least one choice.</p>
              ) : (
                options.map((o, i) => (
                  <div key={i} className="grid grid-cols-[1fr_auto] items-center gap-2">
                    <Input value={o} onChange={(e) => setOptions((arr) => arr.map((x, idx) => (idx === i ? e.target.value : x)))} placeholder="Choice label" className="h-8" />
                    <Button type="button" variant="ghost" size="icon-sm" onClick={() => setOptions((arr) => arr.filter((_, idx) => idx !== i))}>
                      <Trash2 className="size-4 text-muted-foreground" />
                    </Button>
                  </div>
                ))
              )}
            </div>
          ) : null}

          <div className="flex items-center justify-between rounded-lg border p-3">
            <div>
              <Label>Required</Label>
              <p className="text-xs text-muted-foreground">Agents must fill it in when the field is visible.</p>
            </div>
            <Switch checked={required} onCheckedChange={(c) => setRequired(!!c)} disabled={type === "checkbox"} aria-label="Required" />
          </div>

          {/* Visibility conditions */}
          <div className="grid gap-2">
            <div className="flex items-center justify-between">
              <div>
                <Label>Show when</Label>
                <p className="text-xs text-muted-foreground">No conditions ⇒ always shown.</p>
              </div>
              <div className="flex items-center gap-2">
                <Combobox options={MATCH_TYPES.map((t) => ({ value: t.value, label: t.label }))} value={matchType} onChange={setMatchType} size="sm" className="w-auto" />
                <Button type="button" variant="outline" size="sm" onClick={() => setConditions((c) => [...c, { field: fields[0]?.value ?? "status", op: "eq", value: "" }])}>
                  <Plus className="size-4" /> Add
                </Button>
              </div>
            </div>
            {conditions.map((c, i) => {
              const vk = ["empty", "not_empty"].includes(c.op) ? "none" : conditionValueOptions(entityType, c.field);
              return (
                <div key={i} className="grid grid-cols-[1fr_auto_1fr_auto] items-center gap-2">
                  <Combobox options={fields.map((f) => ({ value: f.value, label: f.label }))} value={c.field} size="sm"
                    onChange={(v) => setConditions((arr) => arr.map((x, idx) => (idx === i ? { ...x, field: v, value: "" } : x)))} />
                  <Combobox options={OPERATORS.map((op) => ({ value: op.value, label: op.label }))} value={c.op} size="sm"
                    onChange={(v) => setConditions((arr) => arr.map((x, idx) => (idx === i ? { ...x, op: v } : x)))} />
                  <ValuePicker kind={vk} value={c.value ?? ""} onChange={(v) => setConditions((arr) => arr.map((x, idx) => (idx === i ? { ...x, value: v } : x)))} />
                  <Button type="button" variant="ghost" size="icon-sm" onClick={() => setConditions((arr) => arr.filter((_, idx) => idx !== i))}>
                    <Trash2 className="size-4 text-muted-foreground" />
                  </Button>
                </div>
              );
            })}
          </div>

          <DialogFooter>
            <Button type="submit" disabled={pending}>
              {pending ? <Loader2 className="size-4 animate-spin" /> : <Save className="size-4" />}
              {editing ? "Save field" : "Create field"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function tryParse(s: string): string[] {
  try {
    const a = JSON.parse(s);
    return Array.isArray(a) && a.length ? a.map(String) : [""];
  } catch {
    return [""];
  }
}
function tryParseConds(s: string): Condition[] {
  try {
    const a = JSON.parse(s);
    return Array.isArray(a) ? a : [];
  } catch {
    return [];
  }
}
