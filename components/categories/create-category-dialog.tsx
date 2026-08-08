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
import { CategoryForm } from "./category-form";

type Parent = { id: string; name: string };

export function CreateCategoryDialog({
  parents,
  size = "default",
}: {
  parents: Parent[];
  size?: "default" | "sm";
}) {
  const [open, setOpen] = useState(false);
  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger render={<Button size={size} />}>
        <Plus className="size-4" /> New category
      </DialogTrigger>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>New category</DialogTitle>
          <DialogDescription>
            Add a classification for tickets, problems, changes or assets.
          </DialogDescription>
        </DialogHeader>
        <CategoryForm parents={parents} />
      </DialogContent>
    </Dialog>
  );
}
