import Link from "next/link";
import {
  Settings,
  KeyRound,
  RefreshCw,
  FolderTree,
  Users,
  Timer,
  Zap,
  ArrowUpRight,
  Info,
  Palette,
  Mail,
  Bot,
  UploadCloud,
} from "lucide-react";
import type { Metadata } from "next";
import type { LucideIcon } from "lucide-react";
import { requireRole } from "@/lib/session";
import { PageHeader, PageBody } from "@/components/page-header";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

export const metadata: Metadata = { title: "Settings" };
export const dynamic = "force-dynamic";

type SettingCard = {
  href: string;
  title: string;
  description: string;
  icon: LucideIcon;
};

const CARDS: SettingCard[] = [
  {
    href: "/settings/general",
    title: "General & Branding",
    description: "Application name and public URL used across the app and emails.",
    icon: Palette,
  },
  {
    href: "/settings/email",
    title: "Email (SMTP)",
    description: "Configure outgoing mail delivery, or run in outbox mode.",
    icon: Mail,
  },
  {
    href: "/settings/ai",
    title: "AI Assistant",
    description: "Provider, model and API keys for the built-in AI assistant.",
    icon: Bot,
  },
  {
    href: "/settings/uploads",
    title: "Uploads",
    description: "File attachment size limits for tickets, comments and articles.",
    icon: UploadCloud,
  },
  {
    href: "/settings/sla",
    title: "SLA Policies",
    description: "Define response and resolution targets and how the clock is applied.",
    icon: Timer,
  },
  {
    href: "/automations",
    title: "Automations",
    description: "Build rules that route, prioritise and act on tickets automatically.",
    icon: Zap,
  },
  {
    href: "/settings/api",
    title: "API Tokens",
    description: "Create and revoke personal access tokens for the REST API.",
    icon: KeyRound,
  },
  {
    href: "/syncs",
    title: "Syncs",
    description: "Connect directories and external systems to import data.",
    icon: RefreshCw,
  },
  {
    href: "/categories",
    title: "Categories",
    description: "Organise tickets, problems, changes and assets by category.",
    icon: FolderTree,
  },
  {
    href: "/people",
    title: "People",
    description: "Manage users, roles and group memberships.",
    icon: Users,
  },
];

export default async function SettingsPage() {
  const me = await requireRole("MANAGER");

  return (
    <>
      <PageHeader
        icon={Settings}
        title="Settings"
        description="Configure your workspace, integrations and access."
      />

      <PageBody className="grid gap-6">
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {CARDS.map((card) => (
            <Link key={card.href} href={card.href} className="group block">
              <Card className="h-full transition-colors group-hover:ring-primary/30">
                <CardHeader className="flex-row items-start justify-between">
                  <div className="grid size-9 place-items-center rounded-lg border bg-card text-primary">
                    <card.icon className="size-4.5" />
                  </div>
                  <ArrowUpRight className="size-4 text-muted-foreground transition-colors group-hover:text-primary" />
                </CardHeader>
                <CardContent className="grid gap-1">
                  <CardTitle>{card.title}</CardTitle>
                  <p className="text-sm text-muted-foreground">
                    {card.description}
                  </p>
                </CardContent>
              </Card>
            </Link>
          ))}
        </div>

        <Card>
          <CardHeader className="flex-row items-center gap-2">
            <Info className="size-4 text-muted-foreground" />
            <CardTitle>About Servio</CardTitle>
          </CardHeader>
          <CardContent className="grid gap-2.5 text-sm">
            <div className="flex items-center justify-between gap-2 border-b pb-2.5">
              <span className="text-muted-foreground">Application</span>
              <span className="font-medium">Servio</span>
            </div>
            <div className="flex items-center justify-between gap-2 border-b pb-2.5">
              <span className="text-muted-foreground">Version</span>
              <span className="font-mono text-xs">0.1</span>
            </div>
            <div className="flex items-center justify-between gap-2 border-b pb-2.5">
              <span className="text-muted-foreground">License</span>
              <span className="font-medium">MIT</span>
            </div>
            <div className="flex items-center justify-between gap-2">
              <span className="text-muted-foreground">Signed in as</span>
              <span className="font-medium">{me.email}</span>
            </div>
          </CardContent>
        </Card>
      </PageBody>
    </>
  );
}
