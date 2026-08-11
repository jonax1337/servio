import type { Metadata } from "next";
import { RefreshCw } from "lucide-react";
import { requireRole } from "@/lib/session";
import { PageHeader, PageBody } from "@/components/page-header";
import { SyncSourceForm } from "@/components/syncs/source-form";

export const metadata: Metadata = { title: "New sync source" };
export const dynamic = "force-dynamic";

export default async function NewSyncSourcePage() {
  await requireRole("ADMIN");

  return (
    <>
      <PageHeader
        icon={RefreshCw}
        title="New sync source"
        description="Connect a directory, CSV or API to import users into Servio."
      />
      <PageBody>
        <SyncSourceForm mode="create" />
      </PageBody>
    </>
  );
}
