"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Bell } from "lucide-react";
import { Fragment } from "react";
import { SidebarTrigger } from "@/components/ui/sidebar";
import { LinkButton } from "@/components/link-button";
import {
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbLink,
  BreadcrumbList,
  BreadcrumbPage,
  BreadcrumbSeparator,
} from "@/components/ui/breadcrumb";
import { ThemeToggle } from "@/components/theme-toggle";
import { CommandMenu } from "@/components/command-menu";
import { CreateMenu } from "@/components/create-menu";
import { UserMenu } from "@/components/user-menu";

function label(seg: string) {
  if (/^\d+$/.test(seg)) return `#${seg}`;
  // cuid-like ids (e.g. cmskaeker0022v6l8mv61vvni) → friendly label
  if (/^[a-z0-9]{18,}$/i.test(seg) && /\d/.test(seg)) return "Details";
  return seg
    .replace(/-/g, " ")
    .replace(/\b\w/g, (c) => c.toUpperCase());
}

export function AppTopbar({
  user,
  notifications,
}: {
  user: { name: string; email: string; role: string; image?: string | null };
  notifications: number;
}) {
  const pathname = usePathname();
  const segments = pathname.split("/").filter(Boolean);

  return (
    <header className="sticky top-0 z-30 flex h-14 shrink-0 items-center gap-2 border-b bg-background/80 px-3 backdrop-blur supports-[backdrop-filter]:bg-background/60">
      <SidebarTrigger className="-ml-1" />
      <Breadcrumb className="ml-1 hidden md:block">
        <BreadcrumbList>
          <BreadcrumbItem>
            <BreadcrumbLink render={<Link href="/" />}>Servio</BreadcrumbLink>
          </BreadcrumbItem>
          {segments.map((seg, i) => {
            const href = "/" + segments.slice(0, i + 1).join("/");
            const last = i === segments.length - 1;
            return (
              <Fragment key={href}>
                <BreadcrumbSeparator />
                <BreadcrumbItem>
                  {last ? (
                    <BreadcrumbPage>{label(seg)}</BreadcrumbPage>
                  ) : (
                    <BreadcrumbLink render={<Link href={href} />}>
                      {label(seg)}
                    </BreadcrumbLink>
                  )}
                </BreadcrumbItem>
              </Fragment>
            );
          })}
        </BreadcrumbList>
      </Breadcrumb>

      <div className="ml-auto flex items-center gap-1.5">
        <CommandMenu role={user.role} />
        <CreateMenu />
        <LinkButton
          href="/notifications"
          variant="ghost"
          size="icon"
          className="relative"
          aria-label="Notifications"
        >
          <Bell className="size-4" />
          {notifications > 0 ? (
            <span className="absolute -right-0.5 -top-0.5 flex h-3.5 min-w-3.5 items-center justify-center rounded-full bg-primary px-1 text-[9px] font-semibold leading-none text-primary-foreground ring-2 ring-background">
              {notifications > 9 ? "9+" : notifications}
            </span>
          ) : null}
        </LinkButton>
        <ThemeToggle />
        <UserMenu {...user} />
      </div>
    </header>
  );
}
