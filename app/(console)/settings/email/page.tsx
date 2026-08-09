import type { Metadata } from "next";
import { Mail } from "lucide-react";
import Link from "next/link";
import { requireRole } from "@/lib/session";
import { getSetting, getBoolSetting, settingIsSet } from "@/lib/settings";
import { PageHeader, PageBody } from "@/components/page-header";
import { SettingsForm } from "@/components/settings/settings-form";
import { saveEmailSettings } from "@/lib/actions/settings";

export const metadata: Metadata = { title: "Email settings" };
export const dynamic = "force-dynamic";

export default async function EmailSettingsPage() {
  await requireRole("ADMIN");
  const [host, port, secure, user, from, passSet] = await Promise.all([
    getSetting("SMTP_HOST", ""),
    getSetting("SMTP_PORT", "587"),
    getBoolSetting("SMTP_SECURE"),
    getSetting("SMTP_USER", ""),
    getSetting("SMTP_FROM", ""),
    settingIsSet("SMTP_PASS"),
  ]);

  return (
    <>
      <PageHeader
        icon={Mail}
        title="Email (SMTP)"
        description="Outgoing mail delivery. Leave the host blank to run in outbox mode."
      />
      <PageBody className="grid max-w-2xl gap-4">
        <SettingsForm
          action={saveEmailSettings}
          fields={[
            { type: "text", name: "SMTP_HOST", label: "Host", defaultValue: host ?? "", placeholder: "smtp.example.com" },
            { type: "number", name: "SMTP_PORT", label: "Port", defaultValue: port ?? "587", placeholder: "587" },
            { type: "switch", name: "SMTP_SECURE", label: "Implicit TLS (port 465)", defaultChecked: secure },
            { type: "text", name: "SMTP_USER", label: "Username", defaultValue: user ?? "", placeholder: "Optional — leave blank for no auth" },
            { type: "password", name: "SMTP_PASS", label: "Password", isSet: passSet },
            { type: "text", name: "SMTP_FROM", label: "From address", defaultValue: from ?? "", placeholder: "Servio <servio@example.com>" },
          ]}
        />
        <p className="text-sm text-muted-foreground">
          View delivered and queued messages in the{" "}
          <Link href="/settings/mail" className="text-primary hover:underline">
            mail outbox
          </Link>
          .
        </p>
      </PageBody>
    </>
  );
}
