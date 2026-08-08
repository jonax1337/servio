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
import { ProblemForm } from "./problem-form";

export function CreateProblemDialog({
  options,
  currentUserId,
  size = "default",
}: {
  options: FormOptions;
  currentUserId: string;
  size?: "default" | "sm";
}) {
  const [open, setOpen] = useState(false);
  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger render={<Button size={size} />}>
        <Plus className="size-4" /> New problem
      </DialogTrigger>
      <DialogContent className="sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>New problem</DialogTitle>
          <DialogDescription>
            Open a problem record to investigate root cause.
          </DialogDescription>
        </DialogHeader>
        <ProblemForm options={options} currentUserId={currentUserId} />
      </DialogContent>
    </Dialog>
  );
}
