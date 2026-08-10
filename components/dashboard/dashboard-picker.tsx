"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useTransition } from "react";
import { LayoutDashboard, Plus, Users, X } from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { Combobox } from "@/components/combobox";
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import { createDashboard, deleteDashboard } from "@/lib/actions/dashboards";

export type DashboardRow = {
  id: string;
  name: string;
  isShared: boolean;
  ownerId: string;
  owner: { name: string | null; email: string };
};

export function DashboardPicker({
  dashboards,
  activeId,
  currentUserId,
  canManageShared,
  teams,
}: {
  dashboards: DashboardRow[];
  activeId: string;
  currentUserId: string;
  canManageShared: boolean;
  teams: { value: string; label: string }[];
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [name, setName] = useState("");
  const [shared, setShared] = useState(false);
  const [team, setTeam] = useState("none");
  const [pending, start] = useTransition();

  const tab = (active: boolean) =>
    cn(
      "inline-flex items-center gap-1.5 rounded-lg border px-3 py-1.5 text-sm font-medium transition-colors",
      active
        ? "border-primary/40 bg-primary/10 text-primary"
        : "text-muted-foreground hover:border-primary/40 hover:text-foreground",
    );

  function submitCreate(fd: FormData) {
    start(async () => {
      const id = await createDashboard(fd);
      setOpen(false);
      setName("");
      setShared(false);
      setTeam("none");
      if (id) router.push(`/?dashboard=${id}`);
      else router.refresh();
    });
  }

  return (
    <div className="flex flex-wrap items-center gap-1.5">
      <Link href="/" className={tab(activeId === "default")}>
        <LayoutDashboard className="size-4" /> Default
      </Link>

      {dashboards.map((d) => (
        <span key={d.id} className="group/dash inline-flex items-center">
          <Link href={`/?dashboard=${d.id}`} className={tab(activeId === d.id)}>
            {d.isShared ? <Users className="size-3.5 opacity-70" /> : null}
            {d.name}
          </Link>
          {d.ownerId === currentUserId || canManageShared ? (
            <form action={deleteDashboard} className="-ml-1">
              <input type="hidden" name="id" value={d.id} />
              <button
                type="submit"
                aria-label={`Delete dashboard ${d.name}`}
                title="Delete dashboard"
                className="grid size-5 place-items-center rounded-full text-muted-foreground opacity-0 transition-opacity hover:text-destructive group-hover/dash:opacity-100"
              >
                <X className="size-3" />
              </button>
            </form>
          ) : null}
        </span>
      ))}

      <Button type="button" variant="ghost" size="sm" className="h-8 gap-1.5 text-xs text-muted-foreground" onClick={() => setOpen(true)}>
        <Plus className="size-3.5" /> New dashboard
      </Button>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>New dashboard</DialogTitle>
            <DialogDescription>
              Starts from the default layout — you can rearrange and configure its widgets next.
            </DialogDescription>
          </DialogHeader>
          <form action={submitCreate} className="grid gap-3">
            <div className="grid gap-1.5">
              <Label htmlFor="dash-name">Name</Label>
              <Input
                id="dash-name"
                name="name"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="e.g. Infra team overview"
                autoFocus
                required
              />
            </div>
            {canManageShared ? (
              <>
                <label className="flex items-center gap-2 text-sm">
                  <Checkbox name="isShared" checked={shared} onCheckedChange={(v) => setShared(!!v)} />
                  Share with a team
                </label>
                {shared ? (
                  <Combobox
                    name="groupId"
                    options={[{ value: "none", label: "Everyone (all teams)" }, ...teams]}
                    value={team}
                    onChange={(v) => setTeam(v || "none")}
                    placeholder="Choose a team"
                    searchPlaceholder="Search teams…"
                  />
                ) : null}
              </>
            ) : null}
            <DialogFooter>
              <Button type="submit" disabled={!name.trim() || pending}>Create dashboard</Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}
