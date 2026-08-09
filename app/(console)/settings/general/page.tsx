import type { Metadata } from "next";
import { Palette } from "lucide-react";
import { requireRole } from "@/lib/session";
import { getSetting } from "@/lib/settings";
import { PageHeader, PageBody } from "@/components/page-header";
import { SettingsForm } from "@/components/settings/settings-form";
import { saveGeneralSettings } from "@/lib/actions/settings";

export const metadata: Metadata = { title: "General settings" };
export const dynamic = "force-dynamic";

export default async function GeneralSettingsPage() {
  await requireRole("ADMIN");
  const [appName, appUrl] = await Promise.all([
    getSetting("APP_NAME", "Servio"),
    getSetting("APP_URL", ""),
  ]);

  return (
    <>
      <PageHeader
        icon={Palette}
        title="General & branding"
        description="The application name and public URL used across the app and emails."
      />
      <PageBody className="max-w-2xl">
        <SettingsForm
          action={saveGeneralSettings}
          fields={[
            {
              type: "text",
              name: "APP_NAME",
              label: "Application name",
              defaultValue: appName ?? "",
              placeholder: "Servio",
              hint: "Shown in the UI and used by the AI assistant as the org name.",
            },
            {
              type: "text",
              name: "APP_URL",
              label: "Public URL",
              defaultValue: appUrl ?? "",
              placeholder: "https://servio.example.com",
            },
          ]}
        />
      </PageBody>
    </>
  );
}
