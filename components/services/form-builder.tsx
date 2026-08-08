"use client";

import { useState } from "react";
import { Plus, Trash2, Save, GripVertical } from "lucide-react";
import { updateServiceForm } from "@/lib/actions/services";
import { FIELD_TYPES, type ServiceField, type FieldType } from "@/lib/service-forms";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { Combobox, type ComboOption } from "@/components/combobox";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";

function slug(s: string) {
  return s.toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_|_$/g, "") || "field";
}

export function ServiceFormBuilder({
  serviceId, initialFields, requiresApproval: ra, isRequestable: ir, approverId: ap, agents,
}: {
  serviceId: string;
  initialFields: ServiceField[];
  requiresApproval: boolean;
  isRequestable: boolean;
  approverId: string | null;
  agents: { id: string; name: string | null; email: string }[];
}) {
  const [fields, setFields] = useState<ServiceField[]>(initialFields);
  const [requiresApproval, setRequiresApproval] = useState(ra);
  const [isRequestable, setIsRequestable] = useState(ir);
  const [approverId, setApproverId] = useState(ap ?? "none");

  const approverOpts: ComboOption[] = [
    { value: "none", label: "No approver" },
    ...agents.map((a) => ({ value: a.id, label: a.name ?? a.email, avatar: (a.name ?? a.email).slice(0, 2).toUpperCase(), hint: a.email })),
  ];

  const update = (i: number, patch: Partial<ServiceField>) =>
    setFields((f) => f.map((x, idx) => (idx === i ? { ...x, ...patch } : x)));
  const remove = (i: number) => setFields((f) => f.filter((_, idx) => idx !== i));
  const add = () =>
    setFields((f) => [...f, { key: `field_${f.length + 1}`, label: "", type: "text", required: false }]);

  const normalized = fields
    .filter((f) => f.label.trim())
    .map((f) => ({ ...f, key: f.key || slug(f.label) }));

  return (
    <form action={updateServiceForm} className="grid gap-5">
      <input type="hidden" name="id" value={serviceId} />
      <input type="hidden" name="formSchema" value={JSON.stringify(normalized)} />
      <input type="hidden" name="requiresApproval" value={String(requiresApproval)} />
      <input type="hidden" name="isRequestable" value={String(isRequestable)} />
      <input type="hidden" name="approverId" value={approverId} />

      <div className="grid gap-3 sm:grid-cols-2">
        <label className="flex items-center gap-2 rounded-lg border p-3 text-sm">
          <Checkbox checked={isRequestable} onCheckedChange={(v) => setIsRequestable(!!v)} />
          <span>Requestable from the catalog (IT shop)</span>
        </label>
        <label className="flex items-center gap-2 rounded-lg border p-3 text-sm">
          <Checkbox checked={requiresApproval} onCheckedChange={(v) => setRequiresApproval(!!v)} />
          <span>Requires approval</span>
        </label>
      </div>

      {requiresApproval ? (
        <div className="grid gap-1.5">
          <Label>Approver</Label>
          <Combobox options={approverOpts} value={approverId} onChange={setApproverId} searchPlaceholder="Search people…" />
        </div>
      ) : null}

      <div className="grid gap-3">
        <div className="flex items-center justify-between">
          <Label>Form fields</Label>
          <Button type="button" variant="outline" size="sm" onClick={add}>
            <Plus className="size-4" /> Add field
          </Button>
        </div>

        {fields.length === 0 ? (
          <p className="rounded-lg border border-dashed p-4 text-center text-sm text-muted-foreground">
            No fields yet. The requester will just see a free-text box.
          </p>
        ) : (
          fields.map((f, i) => (
            <div key={i} className="grid gap-2 rounded-lg border bg-card p-3 sm:grid-cols-[auto_1fr_10rem_auto_auto] sm:items-center">
              <GripVertical className="hidden size-4 text-muted-foreground sm:block" />
              <Input
                value={f.label}
                placeholder="Question / label"
                onChange={(e) => update(i, { label: e.target.value, key: slug(e.target.value) })}
              />
              <Select
                value={f.type}
                onValueChange={(v) => update(i, { type: (v as FieldType) ?? "text" })}
                items={Object.fromEntries(FIELD_TYPES.map((t) => [t, t]))}
              >
                <SelectTrigger className="w-full"><SelectValue /></SelectTrigger>
                <SelectContent>
                  {FIELD_TYPES.map((t) => <SelectItem key={t} value={t}>{t}</SelectItem>)}
                </SelectContent>
              </Select>
              <label className="flex items-center gap-1.5 text-xs text-muted-foreground">
                <Checkbox checked={!!f.required} onCheckedChange={(v) => update(i, { required: !!v })} /> req.
              </label>
              <Button type="button" variant="ghost" size="icon-sm" onClick={() => remove(i)} aria-label="Remove field">
                <Trash2 className="size-4 text-muted-foreground" />
              </Button>
              {f.type === "select" ? (
                <Input
                  className="sm:col-span-5"
                  placeholder="Options, comma separated"
                  value={(f.options ?? []).join(", ")}
                  onChange={(e) => update(i, { options: e.target.value.split(",").map((s) => s.trim()).filter(Boolean) })}
                />
              ) : null}
            </div>
          ))
        )}
      </div>

      <div className="flex justify-end border-t pt-4">
        <Button type="submit"><Save className="size-4" /> Save form</Button>
      </div>
    </form>
  );
}
