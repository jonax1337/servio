"use client";

import { useState } from "react";
import Link from "next/link";
import { Plus, ChevronDown, Ticket, AlertTriangle, GitPullRequestArrow } from "lucide-react";
import { Button } from "@/components/ui/button";
import { LinkButton } from "@/components/link-button";
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
      <div data-slot="button-group" className="inline-flex items-center">
        <LinkButton
          href="/tickets/new"
          size="lg"
          className="rounded-r-none border-r border-primary-foreground/20"
        >
          <Plus className="size-4" /> Create
        </LinkButton>
        <DropdownMenuTrigger
          render={
            <Button
              size="icon-lg"
              className="rounded-l-none"
              aria-label="More create options"
            />
          }
        >
          <ChevronDown className="size-3.5 opacity-70" />
        </DropdownMenuTrigger>
      </div>
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
