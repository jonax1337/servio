"use client";

import { useState } from "react";
import { useFormStatus } from "react-dom";
import { Pencil, Loader2, Save } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle, DialogTrigger,
} from "@/components/ui/dialog";

function SaveButton() {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" disabled={pending}>
      {pending ? <Loader2 className="size-4 animate-spin" /> : <Save className="size-4" />}
      Save changes
    </Button>
  );
}

export function EditEntityDialog({
  action,
  idField,
  id,
  title,
  description,
  entityLabel = "record",
}: {
  action: (formData: FormData) => void | Promise<void>;
  idField: string;
  id: number | string;
  title: string;
  description: string;
  entityLabel?: string;
}) {
  const [open, setOpen] = useState(false);
  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger render={<Button variant="outline" size="sm" />}>
        <Pencil className="size-4" /> Edit
      </DialogTrigger>
      <DialogContent className="sm:max-w-xl">
        <DialogHeader>
          <DialogTitle>Edit {entityLabel}</DialogTitle>
        </DialogHeader>
        <form
          action={async (fd) => { await action(fd); setOpen(false); }}
          className="grid gap-4"
        >
          <input type="hidden" name={idField} value={id} />
          <div className="grid gap-1.5">
            <Label htmlFor="edit-title">Title</Label>
            <Input id="edit-title" name="title" defaultValue={title} required />
          </div>
          <div className="grid gap-1.5">
            <Label htmlFor="edit-description">Description</Label>
            <Textarea id="edit-description" name="description" defaultValue={description} className="min-h-40" />
          </div>
          <DialogFooter>
            <SaveButton />
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
