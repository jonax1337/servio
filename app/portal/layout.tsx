import Link from "next/link";
import { LayoutDashboard } from "lucide-react";
import { requireUser, isAgent } from "@/lib/session";
import { Wordmark } from "@/components/brand";
import { PortalNav } from "@/components/portal/portal-nav";
import { ThemeToggle } from "@/components/theme-toggle";
import { UserMenu } from "@/components/user-menu";
import { LinkButton } from "@/components/link-button";

export default async function PortalLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const user = await requireUser();

  return (
    <div className="flex min-h-svh flex-col bg-muted/30">
      <header className="sticky top-0 z-30 border-b bg-background/80 backdrop-blur supports-[backdrop-filter]:bg-background/60">
        <div className="mx-auto flex h-14 w-full max-w-6xl items-center gap-4 px-4">
          <Link href="/portal">
            <Wordmark subtitle="Help Center" />
          </Link>
          <div className="mx-auto hidden md:block">
            <PortalNav />
          </div>
          <div className="ml-auto flex items-center gap-1.5">
            {isAgent(user.role) ? (
              <LinkButton href="/" variant="outline" size="sm">
                <LayoutDashboard className="size-4" /> Agent console
              </LinkButton>
            ) : null}
            <ThemeToggle />
            <UserMenu name={user.name} email={user.email} role={user.role} image={user.image} />
          </div>
        </div>
        <div className="border-t px-4 py-2 md:hidden">
          <PortalNav />
        </div>
      </header>
      <main className="mx-auto w-full max-w-6xl flex-1 px-4 py-8">{children}</main>
      <footer className="border-t py-6 text-center text-xs text-muted-foreground">
        Servio · Open-source ITSM · Need urgent help? Call the Service Desk.
      </footer>
    </div>
  );
}
