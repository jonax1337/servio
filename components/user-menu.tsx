"use client";

import { LogOut, Settings, LifeBuoy } from "lucide-react";
import Link from "next/link";
import { doSignOut } from "@/lib/actions/auth";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { ROLE_META } from "@/lib/constants";

function initials(name: string) {
  return name
    .split(" ")
    .map((p) => p[0])
    .slice(0, 2)
    .join("")
    .toUpperCase();
}

export function UserMenu({
  name,
  email,
  role,
  image,
}: {
  name: string;
  email: string;
  role: string;
  image?: string | null;
}) {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger className="flex items-center gap-2 rounded-full outline-none focus-visible:ring-2 focus-visible:ring-ring">
        <Avatar className="size-8 border">
          {image ? <AvatarImage src={image} alt={name} /> : null}
          <AvatarFallback className="bg-primary/10 text-xs font-semibold text-primary">
            {initials(name)}
          </AvatarFallback>
        </Avatar>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-56">
        <div className="grid gap-0.5 px-2 py-1.5">
          <div className="flex items-center gap-2">
            <Avatar className="size-7 border">
              {image ? <AvatarImage src={image} alt={name} /> : null}
              <AvatarFallback className="bg-primary/10 text-[10px] font-semibold text-primary">
                {initials(name)}
              </AvatarFallback>
            </Avatar>
            <div className="grid min-w-0">
              <span className="truncate text-sm font-medium">{name}</span>
              <span className="truncate text-xs text-muted-foreground">{email}</span>
            </div>
          </div>
          <span className="mt-1 w-fit rounded-full bg-primary/10 px-2 py-0.5 text-[11px] font-medium text-primary">
            {ROLE_META[role as keyof typeof ROLE_META]?.label ?? role}
          </span>
        </div>
        <DropdownMenuSeparator />
        <DropdownMenuItem render={<Link href="/portal" />}>
          <LifeBuoy className="size-4" /> Self-service portal
        </DropdownMenuItem>
        <DropdownMenuItem render={<Link href="/settings" />}>
          <Settings className="size-4" /> Settings
        </DropdownMenuItem>
        <DropdownMenuSeparator />
        <form action={doSignOut}>
          <DropdownMenuItem
            variant="destructive"
            closeOnClick={false}
            nativeButton
            render={<button type="submit" className="w-full" />}
          >
            <LogOut className="size-4" /> Sign out
          </DropdownMenuItem>
        </form>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
