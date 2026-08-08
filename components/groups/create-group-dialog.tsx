"use client";

import { useState } from "react";
import { Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { GroupForm } from "./group-form";
import type { FormOptions } from "@/lib/data/options";

export function CreateGroupDialog({
  options,
  size = "default",
}: {
  options: FormOptions;
  size?: "default" | "sm";
}) {
  const [open, setOpen] = useState(false);
  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger render={<Button size={size} />}>
        <Plus className="size-4" /> New group
      </DialogTrigger>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>New group</DialogTitle>
          <DialogDescription>
            Create a team, department or vendor to route and own work.
          </DialogDescription>
        </DialogHeader>
        <GroupForm options={options} />
      </DialogContent>
    </Dialog>
  );
}
