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
} from "@/components/ui/sidebar";
import { Logo } from "@/components/brand";
import { consoleNav, filterNav } from "@/lib/nav";

export function AppSidebar({ role }: { role: string }) {
  const pathname = usePathname();
  const groups = filterNav(consoleNav, role);

  const isActive = (href: string) =>
    href === "/" ? pathname === "/" : pathname.startsWith(href);

  return (
    <Sidebar collapsible="icon">
      <SidebarHeader className="h-14 justify-center border-b group-data-[collapsible=icon]:items-center">
        <Link href="/" className="flex items-center gap-2.5 px-1">
          <Logo />
          <div className="grid leading-none group-data-[collapsible=icon]:hidden">
            <span className="font-display text-base font-semibold tracking-tight">
              Servio
            </span>
            <span className="text-[11px] font-medium text-muted-foreground">
              Open-Source ITSM
            </span>
          </div>
        </Link>
      </SidebarHeader>

      <SidebarContent className="gap-0.5 py-1">
        <SidebarGroup className="pb-0">
          <SidebarMenu>
            <SidebarMenuItem>
              <SidebarMenuButton
                render={<Link href="/tickets/new" />}
                tooltip="New ticket"
                className="bg-primary font-medium text-primary-foreground hover:bg-primary/90 hover:text-primary-foreground active:bg-primary/90 active:text-primary-foreground"
              >
                <Plus className="size-4" />
                <span>New ticket</span>
              </SidebarMenuButton>
            </SidebarMenuItem>
          </SidebarMenu>
        </SidebarGroup>

        {groups.map((group) => (
          <SidebarGroup key={group.label}>
            <SidebarGroupLabel>{group.label}</SidebarGroupLabel>
            <SidebarGroupContent>
              <SidebarMenu className="gap-1">
                {group.items.map((item) => (
                  <SidebarMenuItem key={item.href}>
                    <SidebarMenuButton
                      render={<Link href={item.href} />}
                      isActive={isActive(item.href)}
                      tooltip={item.title}
                      className="h-9"
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

      <SidebarFooter className="border-t group-data-[collapsible=icon]:hidden">
        <p className="px-2 py-1 text-[11px] text-muted-foreground">
          Servio v0.1 · MIT licensed
        </p>
      </SidebarFooter>
    </Sidebar>
  );
}
