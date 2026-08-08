"use client";

import { useTransition } from "react";
import { Switch } from "@/components/ui/switch";
import { toggleCatalogPublished } from "@/lib/actions/catalog-admin";

export function PublishToggle({ id, published }: { id: string; published: boolean }) {
  const [pending, start] = useTransition();
  return (
    <Switch
      checked={published}
      disabled={pending}
      aria-label="Toggle published"
      onCheckedChange={() => {
        const fd = new FormData();
        fd.set("id", id);
        start(() => toggleCatalogPublished(fd));
      }}
    />
  );
}
