"use client";

import { useActionState, useState } from "react";
import { Plus, Pencil, Loader2, Save } from "lucide-react";
import {
  createLocation, updateLocation, type LocationState,
} from "@/lib/actions/locations";
import { LOCATION_TYPES, LOCATION_TYPE_META } from "@/lib/constants";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Combobox, type ComboOption } from "@/components/combobox";
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger,
} from "@/components/ui/dialog";

type Loc = { id: string; name: string; type: string; parentId: string | null; address: string | null; city: string | null; country: string | null; notes: string | null };

export function LocationDialog({
  parents, location, size = "default",
}: {
  parents: { value: string; label: string }[];
  location?: Loc;
  size?: "default" | "sm" | "icon-sm";
}) {
  const editing = !!location;
  const [open, setOpen] = useState(false);
  const [state, action, pending] = useActionState<LocationState, FormData>(
    editing ? updateLocation : createLocation,
    undefined,
  );
  const [type, setType] = useState(location?.type ?? "BUILDING");
  const [parentId, setParentId] = useState(location?.parentId ?? "none");

  const typeOpts: ComboOption[] = LOCATION_TYPES.map((t) => ({
    value: t, label: LOCATION_TYPE_META[t].label, tone: LOCATION_TYPE_META[t].tone, icon: LOCATION_TYPE_META[t].icon,
  }));
  const parentOpts: ComboOption[] = [
    { value: "none", label: "— Top level —" },
    ...parents.filter((p) => p.value !== location?.id),
  ];

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger render={<Button variant={editing ? "outline" : "default"} size={size} aria-label={editing ? "Edit location" : undefined} />}>
        {editing ? <Pencil className="size-4" /> : <><Plus className="size-4" /> New location</>}
      </DialogTrigger>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>{editing ? "Edit" : "New"} location</DialogTitle>
          <DialogDescription>Sites, buildings, floors, rooms, datacenters and racks.</DialogDescription>
        </DialogHeader>
        <form action={async (fd) => { await action(fd); setOpen(false); }} className="grid gap-4">
          {location ? <input type="hidden" name="id" value={location.id} /> : null}
          <input type="hidden" name="type" value={type} />
          <input type="hidden" name="parentId" value={parentId} />

          {state?.error ? (
            <p className="rounded-lg border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive">{state.error}</p>
          ) : null}

          <div className="grid gap-3 sm:grid-cols-2">
            <div className="grid gap-1.5 sm:col-span-2">
              <Label>Name</Label>
              <Input name="name" defaultValue={location?.name} placeholder="e.g. Datacenter A / Rack 3" required />
            </div>
            <div className="grid gap-1.5">
              <Label>Type</Label>
              <Combobox options={typeOpts} value={type} onChange={setType} />
            </div>
            <div className="grid gap-1.5">
              <Label>Inside</Label>
              <Combobox options={parentOpts} value={parentId} onChange={setParentId} searchPlaceholder="Search locations…" />
            </div>
            <div className="grid gap-1.5">
              <Label>City</Label>
              <Input name="city" defaultValue={location?.city ?? ""} />
            </div>
            <div className="grid gap-1.5">
              <Label>Country</Label>
              <Input name="country" defaultValue={location?.country ?? ""} />
            </div>
            <div className="grid gap-1.5 sm:col-span-2">
              <Label>Address</Label>
              <Input name="address" defaultValue={location?.address ?? ""} />
            </div>
            <div className="grid gap-1.5 sm:col-span-2">
              <Label>Notes</Label>
              <Textarea name="notes" defaultValue={location?.notes ?? ""} className="min-h-20" />
            </div>
          </div>

          <DialogFooter>
            <Button type="submit" disabled={pending}>
              {pending ? <Loader2 className="size-4 animate-spin" /> : <Save className="size-4" />}
              {editing ? "Save location" : "Create location"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
