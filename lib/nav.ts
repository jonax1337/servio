import type { LucideIcon } from "lucide-react";
import {
  LayoutDashboard,
  Ticket,
  AlertTriangle,
  GitPullRequestArrow,
  Inbox,
  Server,
  Boxes,
  Users,
  Tags,
  FolderTree,
  RefreshCw,
  BookOpen,
  KeyRound,
  Settings,
  LifeBuoy,
  CheckSquare,
  Zap,
  MapPin,
} from "lucide-react";

export type NavItem = {
  title: string;
  href: string;
  icon: LucideIcon;
  minRole?: "AGENT" | "MANAGER" | "ADMIN";
};

export type NavGroup = { label: string; items: NavItem[] };

export const consoleNav: NavGroup[] = [
  {
    label: "Overview",
    items: [{ title: "Dashboard", href: "/", icon: LayoutDashboard }],
  },
  {
    label: "Service Operations",
    items: [
      { title: "Tickets", href: "/tickets", icon: Ticket },
      { title: "Board", href: "/queues", icon: Inbox },
      { title: "Problems", href: "/problems", icon: AlertTriangle },
      { title: "Changes", href: "/changes", icon: GitPullRequestArrow },
      { title: "Approvals", href: "/approvals", icon: CheckSquare },
    ],
  },
  {
    label: "Catalog & CMDB",
    items: [
      { title: "Services", href: "/services", icon: LifeBuoy },
      { title: "Assets", href: "/assets", icon: Server },
      { title: "Locations", href: "/locations", icon: MapPin },
      { title: "Categories", href: "/categories", icon: FolderTree },
      { title: "Knowledge Base", href: "/knowledge", icon: BookOpen },
    ],
  },
  {
    label: "Organisation",
    items: [
      { title: "Groups", href: "/groups", icon: Users },
      { title: "People", href: "/people", icon: Boxes },
      { title: "Tags", href: "/tags", icon: Tags },
    ],
  },
  {
    label: "Administration",
    items: [
      { title: "Automations", href: "/automations", icon: Zap, minRole: "MANAGER" },
      { title: "Syncs", href: "/syncs", icon: RefreshCw, minRole: "MANAGER" },
      { title: "API Tokens", href: "/settings/api", icon: KeyRound, minRole: "ADMIN" },
      { title: "Settings", href: "/settings", icon: Settings, minRole: "MANAGER" },
    ],
  },
];

const RANK = { USER: 0, AGENT: 1, MANAGER: 2, ADMIN: 3 } as const;

export function filterNav(nav: NavGroup[], role: string): NavGroup[] {
  const r = RANK[role as keyof typeof RANK] ?? 0;
  return nav
    .map((g) => ({
      ...g,
      items: g.items.filter(
        (i) => !i.minRole || r >= RANK[i.minRole],
      ),
    }))
    .filter((g) => g.items.length > 0);
}
