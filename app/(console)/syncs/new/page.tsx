import type { Metadata } from "next";
import { RefreshCw } from "lucide-react";
import { requireRole } from "@/lib/session";
import { PageHeader, PageBody } from "@/components/page-header";
import { SyncSourceForm, type LdapFormValues } from "@/components/syncs/source-form";
import { ldapConfigToForm, ldapPreset } from "@/lib/connectors/ldap";

export const metadata: Metadata = { title: "New sync source" };
export const dynamic = "force-dynamic";

export default async function NewSyncSourcePage() {
  await requireRole("ADMIN");

  const presets: Record<string, LdapFormValues> = {
    ACTIVE_DIRECTORY: ldapConfigToForm(ldapPreset("ACTIVE_DIRECTORY")),
    LDAP: ldapConfigToForm(ldapPreset("LDAP")),
  };

  return (
    <>
      <PageHeader
        icon={RefreshCw}
        title="New sync source"
        description="Connect a directory to import users into Servio."
      />
      <PageBody>
        <SyncSourceForm mode="create" values={presets.ACTIVE_DIRECTORY} presets={presets} />
      </PageBody>
    </>
  );
}
