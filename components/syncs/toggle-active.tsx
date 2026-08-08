"use client";

import { useTransition } from "react";
import { toast } from "sonner";
import { toggleSyncActive } from "@/lib/actions/syncs";
import { Switch } from "@/components/ui/switch";

export function ToggleActive({
  sourceId,
  isActive,
}: {
  sourceId: string;
  isActive: boolean;
}) {
  const [pending, startTransition] = useTransition();

  return (
    <Switch
      checked={isActive}
      disabled={pending}
      onCheckedChange={(checked) => {
        startTransition(async () => {
          const fd = new FormData();
          fd.set("sourceId", sourceId);
          fd.set("isActive", String(checked));
          await toggleSyncActive(fd);
          toast.success(checked ? "Sync activated" : "Sync paused");
        });
      }}
    />
  );
}
