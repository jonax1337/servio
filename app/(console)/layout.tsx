import { requireRole } from "@/lib/session";
import { db } from "@/lib/db";
import {
  SidebarInset,
  SidebarProvider,
} from "@/components/ui/sidebar";
import { AppSidebar } from "@/components/app-sidebar";
import { AppTopbar } from "@/components/app-topbar";

export default async function ConsoleLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const user = await requireRole("AGENT");
  const notifications = await db.notification.count({
    where: { userId: user.id, read: false },
  });

  return (
    <SidebarProvider>
      <AppSidebar role={user.role} />
      <SidebarInset className="min-w-0">
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
      </SidebarInset>
    </SidebarProvider>
  );
}
