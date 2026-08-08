"use client";

import { useState } from "react";
import { useFormStatus } from "react-dom";
import { Pencil, Loader2, Save } from "lucide-react";
import { updateAsset } from "@/lib/actions/assets";
import {
  ASSET_TYPES, ASSET_STATUSES, ASSET_TYPE_META, ASSET_STATUS_META,
} from "@/lib/constants";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Combobox, type ComboOption } from "@/components/combobox";
import {
  Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle, DialogTrigger,
} from "@/components/ui/dialog";

type Opt = { value: string; label: string }[];
type Asset = {
  id: string; name: string; assetTag: string | null; type: string; status: string;
  serial: string | null; model: string | null; manufacturer: string | null; os: string | null;
  cpu: string | null; ramGb: number | null; storageGb: number | null; ipAddress: string | null;
  macAddress: string | null; location: string | null; locationId: string | null;
  ownerId: string | null; groupId: string | null; cost: number | null; notes: string | null;
  purchaseDate: Date | null; warrantyEnd: Date | null;
};

function SaveBtn() {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" disabled={pending}>
      {pending ? <Loader2 className="size-4 animate-spin" /> : <Save className="size-4" />} Save asset
    </Button>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return <div className="grid gap-1.5"><Label>{label}</Label>{children}</div>;
}

const dateVal = (d: Date | null) => (d ? new Date(d).toISOString().slice(0, 10) : "");

export function AssetEditDialog({
  asset, options,
}: {
  asset: Asset;
  options: { locations: Opt; agents: Opt; groups: Opt };
}) {
  const [open, setOpen] = useState(false);
  const [type, setType] = useState(asset.type);
  const [status, setStatus] = useState(asset.status);
  const [locationId, setLocationId] = useState(asset.locationId ?? "none");
  const [ownerId, setOwnerId] = useState(asset.ownerId ?? "none");
  const [groupId, setGroupId] = useState(asset.groupId ?? "none");

  const typeOpts: ComboOption[] = ASSET_TYPES.map((t) => ({ value: t, label: ASSET_TYPE_META[t].label, tone: ASSET_TYPE_META[t].tone, icon: ASSET_TYPE_META[t].icon }));
  const statusOpts: ComboOption[] = ASSET_STATUSES.map((s) => ({ value: s, label: ASSET_STATUS_META[s].label, tone: ASSET_STATUS_META[s].tone }));
  const withNone = (o: Opt, none: string): ComboOption[] => [{ value: "none", label: none }, ...o];

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger render={<Button variant="outline" size="sm" />}>
        <Pencil className="size-4" /> Edit
      </DialogTrigger>
      <DialogContent className="max-h-[88vh] overflow-y-auto sm:max-w-2xl">
        <DialogHeader><DialogTitle>Edit asset</DialogTitle></DialogHeader>
        <form action={async (fd) => { await updateAsset(fd); setOpen(false); }} className="grid gap-4">
          <input type="hidden" name="id" value={asset.id} />
          <input type="hidden" name="type" value={type} />
          <input type="hidden" name="status" value={status} />
          <input type="hidden" name="locationId" value={locationId} />
          <input type="hidden" name="ownerId" value={ownerId} />
          <input type="hidden" name="groupId" value={groupId} />

          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Name"><Input name="name" defaultValue={asset.name} required /></Field>
            <Field label="Asset tag"><Input name="assetTag" defaultValue={asset.assetTag ?? ""} /></Field>
            <Field label="Type"><Combobox options={typeOpts} value={type} onChange={setType} /></Field>
            <Field label="Status"><Combobox options={statusOpts} value={status} onChange={setStatus} /></Field>
            <Field label="Manufacturer"><Input name="manufacturer" defaultValue={asset.manufacturer ?? ""} /></Field>
            <Field label="Model"><Input name="model" defaultValue={asset.model ?? ""} /></Field>
            <Field label="Serial"><Input name="serial" defaultValue={asset.serial ?? ""} /></Field>
            <Field label="Operating system"><Input name="os" defaultValue={asset.os ?? ""} /></Field>
            <Field label="CPU"><Input name="cpu" defaultValue={asset.cpu ?? ""} /></Field>
            <Field label="RAM (GB)"><Input name="ramGb" type="number" defaultValue={asset.ramGb ?? ""} /></Field>
            <Field label="Storage (GB)"><Input name="storageGb" type="number" defaultValue={asset.storageGb ?? ""} /></Field>
            <Field label="Cost"><Input name="cost" type="number" defaultValue={asset.cost ?? ""} /></Field>
            <Field label="IP address"><Input name="ipAddress" defaultValue={asset.ipAddress ?? ""} /></Field>
            <Field label="MAC address"><Input name="macAddress" defaultValue={asset.macAddress ?? ""} /></Field>
            <Field label="Location"><Combobox options={withNone(options.locations, "No location")} value={locationId} onChange={setLocationId} searchPlaceholder="Search locations…" /></Field>
            <Field label="Location note"><Input name="location" defaultValue={asset.location ?? ""} placeholder="e.g. Rack 3 / U12" /></Field>
            <Field label="Owner"><Combobox options={withNone(options.agents, "No owner")} value={ownerId} onChange={setOwnerId} searchPlaceholder="Search people…" /></Field>
            <Field label="Group"><Combobox options={withNone(options.groups, "No group")} value={groupId} onChange={setGroupId} searchPlaceholder="Search groups…" /></Field>
            <Field label="Purchase date"><Input name="purchaseDate" type="date" defaultValue={dateVal(asset.purchaseDate)} /></Field>
            <Field label="Warranty end"><Input name="warrantyEnd" type="date" defaultValue={dateVal(asset.warrantyEnd)} /></Field>
            <div className="sm:col-span-2"><Field label="Notes"><Textarea name="notes" defaultValue={asset.notes ?? ""} className="min-h-20" /></Field></div>
          </div>

          <DialogFooter><SaveBtn /></DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
