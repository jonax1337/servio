"use client";

import { useTransition } from "react";
import { Switch } from "@/components/ui/switch";
import { toggleRule } from "@/lib/actions/automations";

export function ToggleRuleSwitch({ id, active }: { id: string; active: boolean }) {
  const [pending, start] = useTransition();
  return (
    <Switch
      checked={active}
      disabled={pending}
      aria-label="Toggle rule"
      onCheckedChange={() => {
        const fd = new FormData();
        fd.set("id", id);
        start(() => toggleRule(fd));
      }}
    />
  );
}
