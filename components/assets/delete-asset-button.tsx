"use client";

import { useState, useTransition } from "react";
import { Trash2, Loader2 } from "lucide-react";
import { deleteAsset } from "@/lib/actions/assets";
import { Button } from "@/components/ui/button";
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";

/** Delete an asset behind a confirmation dialog. Server-side is agent-gated. */
export function DeleteAssetButton({ assetId, assetName }: { assetId: string; assetName: string }) {
  const [open, setOpen] = useState(false);
  const [pending, start] = useTransition();

  return (
    <>
      <Button
        type="button"
        variant="outline"
        size="icon-sm"
        aria-label="Delete asset"
        title="Delete asset"
        onClick={() => setOpen(true)}
        className="text-muted-foreground hover:border-destructive/40 hover:text-destructive"
      >
        <Trash2 className="size-4" />
      </Button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Delete asset</DialogTitle>
            <DialogDescription>
              This permanently deletes <span className="font-medium text-foreground">{assetName}</span> and
              removes its relationships and ticket/change links. This can&apos;t be undone.
            </DialogDescription>
          </DialogHeader>
          <form
            action={(fd) => start(async () => { await deleteAsset(fd); })}
          >
            <input type="hidden" name="id" value={assetId} />
            <DialogFooter>
              <Button type="button" variant="ghost" onClick={() => setOpen(false)} disabled={pending}>
                Cancel
              </Button>
              <Button type="submit" variant="destructive" disabled={pending}>
                {pending ? <Loader2 className="size-4 animate-spin" /> : <Trash2 className="size-4" />}
                Delete asset
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </>
  );
}
