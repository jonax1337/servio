import type { Metadata } from "next";
import { UploadCloud } from "lucide-react";
import { requireRole } from "@/lib/session";
import { getSetting } from "@/lib/settings";
import { PageHeader, PageBody } from "@/components/page-header";
import { SettingsForm } from "@/components/settings/settings-form";
import { saveUploadSettings } from "@/lib/actions/settings";

export const metadata: Metadata = { title: "Upload settings" };
export const dynamic = "force-dynamic";

export default async function UploadSettingsPage() {
  await requireRole("ADMIN");
  const [maxMb, gotenbergUrl] = await Promise.all([
    getSetting("MAX_UPLOAD_MB", "15"),
    getSetting("GOTENBERG_URL", ""),
  ]);

  return (
    <>
      <PageHeader
        icon={UploadCloud}
        title="Uploads"
        description="Limits for file attachments on tickets, comments and articles."
      />
      <PageBody className="max-w-2xl">
        <SettingsForm
          action={saveUploadSettings}
          fields={[
            {
              type: "number",
              name: "MAX_UPLOAD_MB",
              label: "Max upload size (MB)",
              defaultValue: maxMb ?? "15",
              placeholder: "15",
              hint: "Enforced server-side per file. The browser pre-check may lag until reload.",
            },
            {
              type: "text",
              name: "GOTENBERG_URL",
              label: "Gotenberg URL (office previews)",
              defaultValue: gotenbergUrl ?? "",
              placeholder: "http://gotenberg:3000",
              hint: "Optional. When set, Office documents (docx/pptx/legacy/ODF) preview as a faithful PDF via a Gotenberg (LibreOffice) service. Blank = built-in best-effort text/HTML preview.",
            },
          ]}
        />
      </PageBody>
    </>
  );
}
