import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { Settings2 } from "lucide-react";
import { requireRole } from "@/lib/session";
import { db } from "@/lib/db";
import { PageHeader, PageBody } from "@/components/page-header";
import { SyncSourceForm } from "@/components/syncs/source-form";
import { parseConfigForForm } from "@/lib/connectors/ldap";

export const metadata: Metadata = { title: "Edit sync source" };
export const dynamic = "force-dynamic";

export default async function EditSyncSourcePage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  await requireRole("ADMIN");
  const { id } = await params;

  const source = await db.syncSource.findUnique({ where: { id } });
  if (!source) notFound();

  const { values, passwordSet } = parseConfigForForm(source.config, source.type);

  return (
    <>
      <PageHeader
        icon={Settings2}
        title={`Edit ${source.name}`}
        description="Update the directory connection and attribute mapping."
      />
      <PageBody>
        <SyncSourceForm
          mode="edit"
          source={{
            id: source.id,
            name: source.name,
            type: source.type,
            schedule: source.schedule,
          }}
          values={values}
          passwordSet={passwordSet}
        />
      </PageBody>
    </>
  );
}
