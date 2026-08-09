import type { Metadata } from "next";
import { Timer } from "lucide-react";
import { db } from "@/lib/db";
import { requireRole } from "@/lib/session";
import { PageHeader, PageBody } from "@/components/page-header";
import { SlaManager } from "@/components/settings/sla-manager";

export const metadata: Metadata = { title: "SLA policies" };
export const dynamic = "force-dynamic";

export default async function SlaSettingsPage() {
  await requireRole("MANAGER");
  const slas = await db.sLA.findMany({
    orderBy: [{ isActive: "desc" }, { resolveMins: "asc" }],
    select: { id: true, name: true, description: true, priority: true, responseMins: true, resolveMins: true, isActive: true },
  });

  return (
    <>
      <PageHeader
        icon={Timer}
        title="SLA policies"
        description="Define response and resolution targets. The clock pauses automatically while a ticket is Pending or On Hold."
      />
      <PageBody>
        <SlaManager slas={slas} />
      </PageBody>
    </>
  );
}
