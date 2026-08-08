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
import type { FormOptions } from "@/lib/data/options";
import { ServiceForm } from "./service-form";

export function CreateServiceDialog({
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
        <Plus className="size-4" /> New service
      </DialogTrigger>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>New service</DialogTitle>
          <DialogDescription>
            Add a business or IT service to the catalog.
          </DialogDescription>
        </DialogHeader>
        <ServiceForm options={options} />
      </DialogContent>
    </Dialog>
  );
}
