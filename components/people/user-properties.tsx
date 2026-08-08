"use client";

import { useTransition } from "react";
import { CircleCheck, Ban, Crown, User } from "lucide-react";
import { updateUserField } from "@/lib/actions/people";
import { Combobox, type ComboOption } from "@/components/combobox";
import { ROLES, ROLE_META } from "@/lib/constants";

type Field = "role" | "isActive" | "isVip";

function Prop({
  label,
  userId,
  field,
  value,
  options,
}: {
  label: string;
  userId: string;
  field: Field;
  value: string;
  options: ComboOption[];
}) {
  const [pending, start] = useTransition();
  return (
    <div className="grid gap-1.5">
      <span className="text-xs font-medium text-muted-foreground">{label}</span>
      <Combobox
        options={options}
        value={value}
        pending={pending}
        searchPlaceholder="Filter…"
        onChange={(v) => {
          const fd = new FormData();
          fd.set("id", userId);
          fd.set("field", field);
          fd.set("value", v);
          start(() => updateUserField(fd));
        }}
      />
    </div>
  );
}

export function UserProperties({
  user,
}: {
  user: { id: string; role: string; isActive: boolean; isVip: boolean };
}) {
  const roleOpts: ComboOption[] = ROLES.map((r) => ({
    value: r,
    label: ROLE_META[r].label,
    tone: ROLE_META[r].tone,
    icon: ROLE_META[r].icon,
  }));
  const statusOpts: ComboOption[] = [
    { value: "true", label: "Active", tone: "success", icon: CircleCheck },
    { value: "false", label: "Inactive", tone: "neutral", icon: Ban },
  ];
  const vipOpts: ComboOption[] = [
    { value: "true", label: "VIP — priority handling", tone: "warning", icon: Crown },
    { value: "false", label: "Standard", tone: "neutral", icon: User },
  ];

  return (
    <div className="grid gap-3">
      <Prop label="Role" userId={user.id} field="role" value={user.role} options={roleOpts} />
      <Prop
        label="Status"
        userId={user.id}
        field="isActive"
        value={user.isActive ? "true" : "false"}
        options={statusOpts}
      />
      <Prop
        label="VIP"
        userId={user.id}
        field="isVip"
        value={user.isVip ? "true" : "false"}
        options={vipOpts}
      />
    </div>
  );
}
