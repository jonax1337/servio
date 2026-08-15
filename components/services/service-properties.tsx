"use client";

import { useTransition } from "react";
import { updateServiceField } from "@/lib/actions/services";
import { Combobox, type ComboOption } from "@/components/combobox";
import {
  SERVICE_STATUSES,
  CRITICALITIES,
  SERVICE_STATUS_META,
  CRITICALITY_META,
} from "@/lib/constants";
import type { FormOptions } from "@/lib/data/options";

type Field = "status" | "criticality" | "categoryId" | "ownerId" | "slaId" | "groupId";

function initials(s: string) {
  return s.split(" ").map((p) => p[0]).slice(0, 2).join("").toUpperCase();
}

function Prop({
  label, serviceId, field, value, options, searchable, placeholder,
}: {
  label: string;
  serviceId: string;
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
          fd.set("id", serviceId);
          fd.set("field", field);
          fd.set("value", v);
          start(() => updateServiceField(fd));
        }}
      />
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
    groupId: string | null;
  };
  options: FormOptions;
}) {
  const statusOpts: ComboOption[] = SERVICE_STATUSES.map((s) => ({
    value: s, label: SERVICE_STATUS_META[s].label, tone: SERVICE_STATUS_META[s].tone, icon: SERVICE_STATUS_META[s].icon,
  }));
  const critOpts: ComboOption[] = CRITICALITIES.map((c) => ({
    value: c, label: CRITICALITY_META[c].label, tone: CRITICALITY_META[c].tone, icon: CRITICALITY_META[c].icon,
  }));
  const none = (label: string): ComboOption => ({ value: "none", label });
  const ownerOpts: ComboOption[] = [
    none("No owner"),
    ...options.agents.map((a) => ({ value: a.id, label: a.name ?? a.email, avatar: initials(a.name ?? a.email), hint: a.email })),
  ];
  const catOpts: ComboOption[] = [none("No category"), ...options.categories.map((c) => ({ value: c.id, label: c.name }))];
  const teamOpts: ComboOption[] = [none("No group"), ...options.groups.map((g) => ({ value: g.id, label: g.name }))];
  const slaOpts: ComboOption[] = [none("No SLA"), ...options.slas.map((s) => ({ value: s.id, label: s.name }))];

  return (
    <div className="grid gap-3">
      <Prop label="Status" serviceId={service.id} field="status" value={service.status} options={statusOpts} />
      <Prop label="Criticality" serviceId={service.id} field="criticality" value={service.criticality} options={critOpts} />
      <Prop label="Owner" serviceId={service.id} field="ownerId" value={service.ownerId} options={ownerOpts} searchable placeholder="No owner" />
      <Prop label="Category" serviceId={service.id} field="categoryId" value={service.categoryId} options={catOpts} searchable placeholder="No category" />
      <Prop label="Group" serviceId={service.id} field="groupId" value={service.groupId} options={teamOpts} searchable placeholder="No group" />
      <Prop label="SLA" serviceId={service.id} field="slaId" value={service.slaId} options={slaOpts} searchable placeholder="No SLA" />
    </div>
  );
}
