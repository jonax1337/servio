"use client";

import { useState } from "react";
import { Pencil, Archive, ArchiveRestore, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger,
} from "@/components/ui/dialog";
import { ConfirmButton } from "@/components/confirm-dialog";
import { CategoryForm, type CategoryData, type ParentOption, type TeamOption } from "@/components/categories/category-form";
import { setCategoryArchived, deleteCategory } from "@/lib/actions/categories";

export function CategoryRowActions({
  category,
  parents,
  teams,
  archived,
  deletable,
}: {
  category: CategoryData;
  parents: ParentOption[];
  teams: TeamOption[];
  archived: boolean;
  deletable: boolean;
}) {
  const [editOpen, setEditOpen] = useState(false);

  return (
    <div className="flex items-center gap-1">
      {/* Edit */}
      <Dialog open={editOpen} onOpenChange={setEditOpen}>
        <DialogTrigger render={<Button variant="ghost" size="icon-sm" aria-label="Edit category" />}>
          <Pencil className="size-4 text-muted-foreground" />
        </DialogTrigger>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>Edit category</DialogTitle>
            <DialogDescription>Update this classification, its team, or where it&apos;s nested.</DialogDescription>
          </DialogHeader>
          <CategoryForm parents={parents} teams={teams} category={category} />
        </DialogContent>
      </Dialog>

      {/* Archive / Restore */}
      <form action={setCategoryArchived}>
        <input type="hidden" name="id" value={category.id} />
        <input type="hidden" name="archived" value={archived ? "false" : "true"} />
        <Button type="submit" variant="ghost" size="icon-sm" aria-label={archived ? "Restore category" : "Archive category"}>
          {archived ? (
            <ArchiveRestore className="size-4 text-muted-foreground" />
          ) : (
            <Archive className="size-4 text-muted-foreground" />
          )}
        </Button>
      </form>

      {/* Delete — only when nothing references it */}
      {deletable ? (
        <ConfirmButton
          action={deleteCategory}
          fields={{ id: category.id }}
          title="Delete category?"
          description={`"${category.name}" will be permanently removed. This can't be undone.`}
          triggerVariant="ghost"
          triggerLabel="Delete category"
        >
          <Trash2 className="size-4 text-muted-foreground" />
        </ConfirmButton>
      ) : null}
    </div>
  );
}
