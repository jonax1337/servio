"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Search, Ticket, AlertTriangle, GitPullRequestArrow, Server, User, LifeBuoy, Loader2 } from "lucide-react";
import {
  Command,
  CommandDialog,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command";
import { consoleNav, filterNav } from "@/lib/nav";

type Result = { group: string; href: string; title: string; sub: string };

const GROUP_ICON: Record<string, typeof Ticket> = {
  Tickets: Ticket, Problems: AlertTriangle, Changes: GitPullRequestArrow,
  Assets: Server, People: User, Services: LifeBuoy,
};

export function CommandMenu({ role }: { role: string }) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<Result[]>([]);
  const [loading, setLoading] = useState(false);
  const router = useRouter();
  const groups = filterNav(consoleNav, role);
  const reqId = useRef(0);

  useEffect(() => {
    const down = (e: KeyboardEvent) => {
      if ((e.key === "k" && (e.metaKey || e.ctrlKey)) || e.key === "/") {
        if (e.key === "/" && /input|textarea/i.test((e.target as HTMLElement)?.tagName)) return;
        e.preventDefault();
        setOpen((o) => !o);
      }
    };
    document.addEventListener("keydown", down);
    return () => document.removeEventListener("keydown", down);
  }, []);

  // debounced server search
  useEffect(() => {
    const q = query.trim();
    if (!q) { setResults([]); setLoading(false); return; }
    setLoading(true);
    const id = ++reqId.current;
    const t = setTimeout(async () => {
      try {
        const res = await fetch(`/api/search?q=${encodeURIComponent(q)}`);
        const data = await res.json();
        if (id === reqId.current) setResults(data.results ?? []);
      } catch {
        if (id === reqId.current) setResults([]);
      } finally {
        if (id === reqId.current) setLoading(false);
      }
    }, 220);
    return () => clearTimeout(t);
  }, [query]);

  const go = (href: string) => {
    setOpen(false);
    setQuery("");
    router.push(href);
  };

  const grouped = results.reduce<Record<string, Result[]>>((acc, r) => {
    (acc[r.group] ??= []).push(r);
    return acc;
  }, {});

  return (
    <>
      <button
        onClick={() => setOpen(true)}
        className="flex h-9 w-full items-center gap-2 rounded-lg border bg-muted/40 px-3 text-sm text-muted-foreground transition-colors hover:bg-muted sm:w-64"
      >
        <Search className="size-4" />
        <span className="flex-1 text-left">Search…</span>
        <kbd className="pointer-events-none hidden select-none items-center gap-0.5 rounded border bg-background px-1.5 font-mono text-[10px] font-medium sm:flex">
          ⌘K
        </kbd>
      </button>
      <CommandDialog open={open} onOpenChange={setOpen}>
        <Command shouldFilter={false}>
          <CommandInput
            value={query}
            onValueChange={setQuery}
            placeholder="Search tickets, assets, people…"
          />
          <CommandList>
            {query.trim() ? (
              <>
                {loading ? (
                  <div className="flex items-center gap-2 px-3 py-6 text-sm text-muted-foreground">
                    <Loader2 className="size-4 animate-spin" /> Searching…
                  </div>
                ) : results.length === 0 ? (
                  <CommandEmpty>No results for “{query}”.</CommandEmpty>
                ) : (
                  Object.entries(grouped).map(([group, items]) => {
                    const Icon = GROUP_ICON[group] ?? Search;
                    return (
                      <CommandGroup key={group} heading={group}>
                        {items.map((r) => (
                          <CommandItem key={r.href} value={r.href} onSelect={() => go(r.href)}>
                            <Icon className="size-4 text-muted-foreground" />
                            <span className="flex-1 truncate">{r.title}</span>
                            <span className="font-mono text-xs text-muted-foreground">{r.sub}</span>
                          </CommandItem>
                        ))}
                      </CommandGroup>
                    );
                  })
                )}
              </>
            ) : (
              <>
                <CommandGroup heading="Quick actions">
                  <CommandItem value="new-ticket" onSelect={() => go("/tickets/new")}>
                    <Ticket className="size-4" /> Create ticket
                  </CommandItem>
                  <CommandItem value="new-change" onSelect={() => go("/changes/new")}>
                    <GitPullRequestArrow className="size-4" /> New change request
                  </CommandItem>
                  <CommandItem value="new-asset" onSelect={() => go("/assets/new")}>
                    <Server className="size-4" /> Add asset
                  </CommandItem>
                </CommandGroup>
                {groups.map((g) => (
                  <CommandGroup key={g.label} heading={g.label}>
                    {g.items.map((i) => (
                      <CommandItem key={i.href} value={i.href} onSelect={() => go(i.href)}>
                        <i.icon className="size-4" />
                        {i.title}
                      </CommandItem>
                    ))}
                  </CommandGroup>
                ))}
              </>
            )}
          </CommandList>
        </Command>
      </CommandDialog>
    </>
  );
}
