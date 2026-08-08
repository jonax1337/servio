"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";

const items = [
  { href: "/portal", label: "Home" },
  { href: "/portal/new", label: "New request" },
  { href: "/portal/tickets", label: "My tickets" },
  { href: "/portal/services", label: "Services" },
  { href: "/portal/knowledge", label: "Knowledge" },
];

export function PortalNav() {
  const pathname = usePathname();
  const active = (href: string) =>
    href === "/portal" ? pathname === "/portal" : pathname.startsWith(href);

  return (
    <nav className="flex items-center gap-1">
      {items.map((i) => (
        <Link
          key={i.href}
          href={i.href}
          className={cn(
            "rounded-lg px-3 py-1.5 text-sm font-medium transition-colors",
            active(i.href)
              ? "bg-primary/10 text-primary"
              : "text-muted-foreground hover:bg-muted hover:text-foreground",
          )}
        >
          {i.label}
        </Link>
      ))}
    </nav>
  );
}
