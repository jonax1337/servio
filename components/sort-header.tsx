"use client";

import { useRouter, usePathname, useSearchParams } from "next/navigation";
import { useTransition } from "react";
import { ArrowUp, ArrowDown, ChevronsUpDown } from "lucide-react";
import { cn } from "@/lib/utils";
import { TableHead } from "@/components/ui/table";

/**
 * A sortable table-header cell, URL-driven (`?sort=&dir=`). Drop it into any
 * server-rendered list table; pass the page's effective `sort`/`dir` so the active
 * column is highlighted (including the default). `numeric` sorts descending first.
 */
export function SortableHead({
  k,
  label,
  sort,
  dir,
  className,
  numeric,
}: {
  k: string;
  label: string;
  sort: string;
  dir: "asc" | "desc";
  className?: string;
  numeric?: boolean;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const sp = useSearchParams();
  const [pending, start] = useTransition();

  const active = sort === k;
  const Icon = active ? (dir === "asc" ? ArrowUp : ArrowDown) : ChevronsUpDown;

  function go() {
    const p = new URLSearchParams(sp.toString());
    const nextDir = active ? (dir === "asc" ? "desc" : "asc") : numeric ? "desc" : "asc";
    p.set("sort", k);
    p.set("dir", nextDir);
    p.delete("page");
    start(() => router.push(`${pathname}?${p.toString()}`));
  }

  return (
    <TableHead className={className}>
      <button
        type="button"
        onClick={go}
        data-pending={pending ? "" : undefined}
        className={cn("inline-flex items-center gap-1 hover:text-foreground", active && "text-foreground")}
      >
        {label}
        <Icon className={cn("size-3.5", active ? "opacity-80" : "opacity-40")} />
      </button>
    </TableHead>
  );
}
