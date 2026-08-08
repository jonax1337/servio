"use client";

import { useState } from "react";
import Link from "next/link";
import { Plus, ChevronDown, Ticket, AlertTriangle, GitPullRequestArrow } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

export function CreateMenu() {
  const [open, setOpen] = useState(false);
  return (
    <DropdownMenu open={open} onOpenChange={setOpen}>
      <DropdownMenuTrigger render={<Button className="h-9" onMouseEnter={() => setOpen(true)} />}>
        <Plus className="size-4" /> Create
        <ChevronDown className="size-3.5 opacity-70" />
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-44">
        <DropdownMenuItem render={<Link href="/tickets/new" />}>
          <Ticket className="size-4" /> New ticket
        </DropdownMenuItem>
        <DropdownMenuItem render={<Link href="/problems/new" />}>
          <AlertTriangle className="size-4" /> New problem
        </DropdownMenuItem>
        <DropdownMenuItem render={<Link href="/changes/new" />}>
          <GitPullRequestArrow className="size-4" /> New change
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
