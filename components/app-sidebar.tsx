"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Plus } from "lucide-react";
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarRail,
} from "@/components/ui/sidebar";
import { LinkButton } from "@/components/link-button";
import { Wordmark } from "@/components/brand";
import { consoleNav, filterNav } from "@/lib/nav";

export function AppSidebar({ role }: { role: string }) {
  const pathname = usePathname();
  const groups = filterNav(consoleNav, role);

  const isActive = (href: string) =>
    href === "/" ? pathname === "/" : pathname.startsWith(href);

  return (
    <Sidebar collapsible="icon">
      <SidebarHeader className="border-b">
        <Link href="/" className="flex items-center px-1 py-1.5">
          <Wordmark subtitle="Open-Source ITSM" />
        </Link>
      </SidebarHeader>

      <SidebarContent>
        <div className="px-2 pt-2 group-data-[collapsible=icon]:hidden">
          <LinkButton
            href="/tickets/new"
            size="sm"
            className="w-full justify-start"
          >
            <Plus className="size-4" /> New ticket
          </LinkButton>
        </div>
        {groups.map((group) => (
          <SidebarGroup key={group.label}>
            <SidebarGroupLabel>{group.label}</SidebarGroupLabel>
            <SidebarGroupContent>
              <SidebarMenu>
                {group.items.map((item) => (
                  <SidebarMenuItem key={item.href}>
                    <SidebarMenuButton
                      render={<Link href={item.href} />}
                      isActive={isActive(item.href)}
                      tooltip={item.title}
                    >
                      <item.icon className="size-4" />
                      <span>{item.title}</span>
                    </SidebarMenuButton>
                  </SidebarMenuItem>
                ))}
              </SidebarMenu>
            </SidebarGroupContent>
          </SidebarGroup>
        ))}
      </SidebarContent>

      <SidebarFooter className="border-t">
        <p className="px-2 py-1 text-[11px] text-muted-foreground group-data-[collapsible=icon]:hidden">
          v0.1 · MIT licensed
        </p>
      </SidebarFooter>
      <SidebarRail />
    </Sidebar>
  );
}
