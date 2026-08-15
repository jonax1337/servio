"use client";

import { useRouter, usePathname, useSearchParams } from "next/navigation";
import { useCallback, useEffect, useMemo, useState, useTransition } from "react";
import { Search, X, Loader2, Download } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Combobox, type ComboOption } from "@/components/combobox";
import { Button, buttonVariants } from "@/components/ui/button";

type Option = { value: string; label: string };

/**
 * Filter toolbar for the audit viewer: free-text search, actor / entity /
 * action pickers, an inclusive date range and a filter-aware "Export CSV"
 * button that points at /api/export?type=audit with the same query.
 */
export function AuditToolbar({
  actors,
  entities,
  actions,
}: {
  actors: Option[];
  entities: Option[];
  actions: Option[];
}) {
  const router = useRouter();
  const pathname = usePathname();
  const sp = useSearchParams();
  const [isPending, startTransition] = useTransition();
  const [q, setQ] = useState(sp.get("q") ?? "");

  const setParam = useCallback(
    (key: string, value: string) => {
      const params = new URLSearchParams(sp.toString());
      if (!value || value === "all") params.delete(key);
      else params.set(key, value);
      params.delete("page");
      startTransition(() => router.push(`${pathname}?${params.toString()}`));
    },
    [sp, pathname, router],
  );

  // debounce free-text search
  useEffect(() => {
    const t = setTimeout(() => {
      if ((sp.get("q") ?? "") !== q) setParam("q", q);
    }, 350);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [q]);

  const actorOpts: ComboOption[] = useMemo(
    () => [{ value: "all", label: "All actors" }, ...actors],
    [actors],
  );
  const entityOpts: ComboOption[] = useMemo(
    () => [{ value: "all", label: "All entities" }, ...entities],
    [entities],
  );
  const actionOpts: ComboOption[] = useMemo(
    () => [{ value: "all", label: "All actions" }, ...actions],
    [actions],
  );

  const from = sp.get("from") ?? "";
  const to = sp.get("to") ?? "";

  // Export link mirrors every active filter so the download matches the view.
  const exportHref = useMemo(() => {
    const params = new URLSearchParams();
    params.set("type", "audit");
    for (const key of ["q", "userId", "entity", "action", "from", "to"]) {
      const v = sp.get(key);
      if (v) params.set(key, v);
    }
    return `/api/export?${params.toString()}`;
  }, [sp]);

  const hasFilters =
    q ||
    ["userId", "entity", "action", "from", "to"].some((k) => sp.get(k));

  return (
    <div className="flex flex-wrap items-center gap-2">
      <div className="relative w-full sm:w-56">
        <Search className="absolute left-2.5 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
        <Input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Search summary or entity id…"
          className="pl-8"
        />
        {isPending ? (
          <Loader2 className="absolute right-2.5 top-1/2 size-4 -translate-y-1/2 animate-spin text-muted-foreground" />
        ) : null}
      </div>

      <Combobox
        options={actorOpts}
        value={sp.get("userId") ?? "all"}
        onChange={(v) => setParam("userId", v || "all")}
        placeholder="Actor"
        searchPlaceholder="Search actors…"
        size="sm"
        className="w-auto min-w-[9rem]"
      />
      <Combobox
        options={entityOpts}
        value={sp.get("entity") ?? "all"}
        onChange={(v) => setParam("entity", v || "all")}
        placeholder="Entity"
        searchPlaceholder="Search entities…"
        size="sm"
        className="w-auto min-w-[8rem]"
      />
      <Combobox
        options={actionOpts}
        value={sp.get("action") ?? "all"}
        onChange={(v) => setParam("action", v || "all")}
        placeholder="Action"
        searchPlaceholder="Search actions…"
        size="sm"
        className="w-auto min-w-[8rem]"
      />

      <Input
        type="date"
        aria-label="From date"
        value={from}
        onChange={(e) => setParam("from", e.target.value)}
        className="w-auto"
      />
      <Input
        type="date"
        aria-label="To date"
        value={to}
        onChange={(e) => setParam("to", e.target.value)}
        className="w-auto"
      />

      {hasFilters ? (
        <Button
          variant="ghost"
          size="sm"
          onClick={() => {
            setQ("");
            startTransition(() => router.push(pathname));
          }}
        >
          <X className="size-4" /> Clear
        </Button>
      ) : null}

      <div className="ml-auto">
        <a
          href={exportHref}
          download
          className={buttonVariants({ variant: "outline", size: "sm" })}
        >
          <Download className="size-4" /> Export CSV
        </a>
      </div>
    </div>
  );
}
