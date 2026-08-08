"use client";

import { useActionState, useEffect, useRef } from "react";
import { Loader2, Plus } from "lucide-react";
import { toast } from "sonner";
import { createTag, type ActionState } from "@/lib/actions/tags";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

export function TagCreator() {
  const [state, action, pending] = useActionState<ActionState, FormData>(
    createTag,
    undefined,
  );
  const formRef = useRef<HTMLFormElement>(null);
  const wasPending = useRef(false);

  useEffect(() => {
    if (wasPending.current && !pending) {
      if (state?.error) {
        toast.error(state.error);
      } else {
        toast.success("Tag created");
        formRef.current?.reset();
      }
    }
    wasPending.current = pending;
  }, [pending, state]);

  const fe = state?.fieldErrors ?? {};

  return (
    <form ref={formRef} action={action} className="grid gap-3">
      <div className="flex flex-wrap items-end gap-3">
        <div className="grid min-w-48 flex-1 gap-1.5">
          <Label htmlFor="tag-name">Name</Label>
          <Input
            id="tag-name"
            name="name"
            placeholder="e.g. hardware"
            required
          />
        </div>
        <div className="grid gap-1.5">
          <Label htmlFor="tag-color">Color</Label>
          <Input
            id="tag-color"
            name="color"
            type="color"
            defaultValue="#64748b"
            className="h-8 w-14 cursor-pointer p-1"
          />
        </div>
        <Button type="submit" disabled={pending}>
          {pending ? (
            <Loader2 className="size-4 animate-spin" />
          ) : (
            <Plus className="size-4" />
          )}
          Add tag
        </Button>
      </div>
      {fe.name ? (
        <p className="text-xs text-destructive">{fe.name[0]}</p>
      ) : null}
    </form>
  );
}
