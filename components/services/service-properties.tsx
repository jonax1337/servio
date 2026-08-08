"use client";

import { useTransition } from "react";
import { Loader2 } from "lucide-react";
import { updateServiceField } from "@/lib/actions/services";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  SERVICE_STATUSES,
  CRITICALITIES,
  SERVICE_STATUS_META,
  CRITICALITY_META,
} from "@/lib/constants";
import type { FormOptions } from "@/lib/data/options";

type Field = "status" | "criticality" | "categoryId" | "ownerId" | "slaId";

function Row({
  label,
  serviceId,
  field,
  value,
  options,
  includeNone,
}: {
  label: string;
  serviceId: string;
  field: Field;
  value: string | null;
  options: { value: string; label: string }[];
  includeNone?: boolean;
}) {
  const [pending, start] = useTransition();
  return (
    <div className="grid grid-cols-[100px_1fr] items-center gap-2">
      <span className="text-xs font-medium text-muted-foreground">{label}</span>
      <div className="relative">
        <Select
          items={{
            ...(includeNone ? { none: "— None —" } : {}),
            ...Object.fromEntries(options.map((o) => [o.value, o.label])),
          }}
          value={value ?? "none"}
          onValueChange={(v) => {
            const fd = new FormData();
            fd.set("id", serviceId);
            fd.set("field", field);
            fd.set("value", (v as string | null) ?? "none");
            start(() => updateServiceField(fd));
          }}
        >
          <SelectTrigger size="sm" className="w-full">
            <SelectValue placeholder="—" />
          </SelectTrigger>
          <SelectContent>
            {includeNone ? <SelectItem value="none">— None —</SelectItem> : null}
            {options.map((o) => (
              <SelectItem key={o.value} value={o.value}>
                {o.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        {pending ? (
          <Loader2 className="absolute right-7 top-1/2 size-3.5 -translate-y-1/2 animate-spin text-muted-foreground" />
        ) : null}
      </div>
    </div>
  );
}

export function ServiceProperties({
  service,
  options,
}: {
  service: {
    id: string;
    status: string;
    criticality: string;
    categoryId: string | null;
    ownerId: string | null;
    slaId: string | null;
  };
  options: FormOptions;
}) {
  return (
    <div className="grid gap-2.5">
      <Row
        label="Status"
        serviceId={service.id}
        field="status"
        value={service.status}
        options={SERVICE_STATUSES.map((s) => ({
          value: s,
          label: SERVICE_STATUS_META[s].label,
        }))}
      />
      <Row
        label="Criticality"
        serviceId={service.id}
        field="criticality"
        value={service.criticality}
        options={CRITICALITIES.map((c) => ({
          value: c,
          label: CRITICALITY_META[c].label,
        }))}
      />
      <Row
        label="Owner"
        serviceId={service.id}
        field="ownerId"
        value={service.ownerId}
        includeNone
        options={options.agents.map((a) => ({
          value: a.id,
          label: a.name ?? a.email,
        }))}
      />
      <Row
        label="Category"
        serviceId={service.id}
        field="categoryId"
        value={service.categoryId}
        includeNone
        options={options.categories.map((c) => ({ value: c.id, label: c.name }))}
      />
      <Row
        label="SLA"
        serviceId={service.id}
        field="slaId"
        value={service.slaId}
        includeNone
        options={options.slas.map((s) => ({ value: s.id, label: s.name }))}
      />
    </div>
  );
}
