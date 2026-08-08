"use client";

import { useTransition } from "react";
import { Loader2 } from "lucide-react";
import { updateAssetField } from "@/lib/actions/assets";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { ASSET_STATUSES, ASSET_STATUS_META } from "@/lib/constants";
import type { FormOptions } from "@/lib/data/options";

type Field = "status" | "ownerId" | "groupId";

function Row({
  label,
  assetId,
  field,
  value,
  options,
  includeNone,
}: {
  label: string;
  assetId: string;
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
            ...(includeNone ? { none: "Unassigned" } : {}),
            ...Object.fromEntries(options.map((o) => [o.value, o.label])),
          }}
          value={value ?? "none"}
          onValueChange={(v) => {
            const fd = new FormData();
            fd.set("id", assetId);
            fd.set("field", field);
            fd.set("value", (v as string | null) ?? "none");
            start(() => updateAssetField(fd));
          }}
        >
          <SelectTrigger size="sm" className="w-full">
            <SelectValue placeholder="—" />
          </SelectTrigger>
          <SelectContent>
            {includeNone ? (
              <SelectItem value="none">Unassigned</SelectItem>
            ) : null}
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
  return (
    <div className="grid gap-2.5">
      <Row
        label="Status"
        assetId={asset.id}
        field="status"
        value={asset.status}
        options={ASSET_STATUSES.map((s) => ({
          value: s,
          label: ASSET_STATUS_META[s].label,
        }))}
      />
      <Row
        label="Owner"
        assetId={asset.id}
        field="ownerId"
        value={asset.ownerId}
        includeNone
        options={options.agents.map((a) => ({
          value: a.id,
          label: a.name ?? a.email,
        }))}
      />
      <Row
        label="Group"
        assetId={asset.id}
        field="groupId"
        value={asset.groupId}
        includeNone
        options={options.groups.map((g) => ({ value: g.id, label: g.name }))}
      />
    </div>
  );
}
