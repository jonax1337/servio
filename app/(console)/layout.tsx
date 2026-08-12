import { requireRole, hasRole } from "@/lib/session";
import { db } from "@/lib/db";
import { aiConfigured, aiTeaserEnabled } from "@/lib/ai";
import {
  SidebarInset,
  SidebarProvider,
} from "@/components/ui/sidebar";
import { AppSidebar } from "@/components/app-sidebar";
import { AppTopbar } from "@/components/app-topbar";
import { VioProvider } from "@/components/assistant/vio-provider";
import { VioMount } from "@/components/assistant/vio-mount";

export default async function ConsoleLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const user = await requireRole("AGENT");
  const [notifications, configured, teaser] = await Promise.all([
    db.notification.count({ where: { userId: user.id, read: false } }),
    aiConfigured(),
    aiTeaserEnabled(),
  ]);

  return (
    <SidebarProvider>
      <AppSidebar role={user.role} />
      <SidebarInset className="min-w-0">
        <VioProvider>
          <AppTopbar
            user={{
              name: user.name,
              email: user.email,
              role: user.role,
              image: user.image,
            }}
            notifications={notifications}
          />
          <main className="min-w-0 flex-1">{children}</main>
          <VioMount
            configured={configured}
            teaser={teaser}
            isAdmin={hasRole(user.role, "ADMIN")}
          />
        </VioProvider>
      </SidebarInset>
    </SidebarProvider>
  );
}
