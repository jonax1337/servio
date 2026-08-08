"use client";

import { useTransition } from "react";
import { Loader2 } from "lucide-react";
import { updateUserField } from "@/lib/actions/people";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { ROLES, ROLE_META } from "@/lib/constants";

function Row({
  label,
  userId,
  field,
  value,
  options,
}: {
  label: string;
  userId: string;
  field: "role" | "isActive";
  value: string;
  options: { value: string; label: string }[];
}) {
  const [pending, start] = useTransition();
  return (
    <div className="grid grid-cols-[100px_1fr] items-center gap-2">
      <span className="text-xs font-medium text-muted-foreground">{label}</span>
      <div className="relative">
        <Select
          items={Object.fromEntries(options.map((o) => [o.value, o.label]))}
          value={value}
          onValueChange={(v) => {
            const fd = new FormData();
            fd.set("id", userId);
            fd.set("field", field);
            fd.set("value", (v as string | null) ?? "none");
            start(() => updateUserField(fd));
          }}
        >
          <SelectTrigger size="sm" className="w-full">
            <SelectValue placeholder="—" />
          </SelectTrigger>
          <SelectContent>
            {options.map((o) => (
              <SelectItem key={o.value} value={o.value}>
                {o.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        {pending ? (
          <Loader2 className="absolute right-7 top-1/2 size-3.5 -translate-y-1/2 animate-spin text-muted-foreground" />
        ) : null}
      </div>
    </div>
  );
}

export function UserProperties({
  user,
}: {
  user: { id: string; role: string; isActive: boolean };
}) {
  return (
    <div className="grid gap-2.5">
      <Row
        label="Role"
        userId={user.id}
        field="role"
        value={user.role}
        options={ROLES.map((r) => ({ value: r, label: ROLE_META[r].label }))}
      />
      <Row
        label="Status"
        userId={user.id}
        field="isActive"
        value={user.isActive ? "true" : "false"}
        options={[
          { value: "true", label: "Active" },
          { value: "false", label: "Inactive" },
        ]}
      />
    </div>
  );
}
