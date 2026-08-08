"use client";

import { useTransition } from "react";
import { updateAssetField } from "@/lib/actions/assets";
import { Combobox, type ComboOption } from "@/components/combobox";
import { ASSET_STATUSES, ASSET_STATUS_META } from "@/lib/constants";
import type { FormOptions } from "@/lib/data/options";

type Field = "status" | "ownerId" | "groupId";

function initials(s: string) {
  return s.split(" ").map((p) => p[0]).slice(0, 2).join("").toUpperCase();
}

function Prop({
  label, assetId, field, value, options, searchable, placeholder,
}: {
  label: string;
  assetId: string;
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
          fd.set("id", assetId);
          fd.set("field", field);
          fd.set("value", v);
          start(() => updateAssetField(fd));
        }}
      />
    </div>
  );
}

export function AssetProperties({
  asset,
  options,
}: {
  asset: {
    id: string;
    status: string;
    ownerId: string | null;
    groupId: string | null;
  };
  options: FormOptions;
}) {
  const statusOpts: ComboOption[] = ASSET_STATUSES.map((s) => ({
    value: s, label: ASSET_STATUS_META[s].label, tone: ASSET_STATUS_META[s].tone, icon: ASSET_STATUS_META[s].icon,
  }));
  const none = (label: string): ComboOption => ({ value: "none", label });
  const ownerOpts: ComboOption[] = [
    none("Unassigned"),
    ...options.agents.map((a) => ({ value: a.id, label: a.name ?? a.email, avatar: initials(a.name ?? a.email), hint: a.email })),
  ];
  const groupOpts: ComboOption[] = [none("No group"), ...options.groups.map((g) => ({ value: g.id, label: g.name }))];

  return (
    <div className="grid gap-3">
      <Prop label="Status" assetId={asset.id} field="status" value={asset.status} options={statusOpts} />
      <Prop label="Owner" assetId={asset.id} field="ownerId" value={asset.ownerId} options={ownerOpts} searchable placeholder="Unassigned" />
      <Prop label="Group" assetId={asset.id} field="groupId" value={asset.groupId} options={groupOpts} searchable placeholder="No group" />
    </div>
  );
}
