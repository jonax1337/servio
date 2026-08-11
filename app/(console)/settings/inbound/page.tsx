import type { Metadata } from "next";
import { Inbox } from "lucide-react";
import Link from "next/link";
import { requireRole } from "@/lib/session";
import { getSetting, getBoolSetting, settingIsSet } from "@/lib/settings";
import { PageHeader, PageBody } from "@/components/page-header";
import { SettingsForm } from "@/components/settings/settings-form";
import { saveInboundSettings } from "@/lib/actions/settings";

export const metadata: Metadata = { title: "Inbound mail" };
export const dynamic = "force-dynamic";

export default async function InboundSettingsPage() {
  await requireRole("ADMIN");
  const [enabled, host, port, secure, user, folder, poll, plus, passSet] = await Promise.all([
    getBoolSetting("IMAP_ENABLED"),
    getSetting("IMAP_HOST", ""),
    getSetting("IMAP_PORT", "993"),
    getBoolSetting("IMAP_SECURE", true),
    getSetting("IMAP_USER", ""),
    getSetting("IMAP_FOLDER", "INBOX"),
    getSetting("IMAP_POLL_SECONDS", "60"),
    getBoolSetting("MAIL_PLUS_ADDRESSING"),
    settingIsSet("IMAP_PASS"),
  ]);

  return (
    <>
      <PageHeader
        icon={Inbox}
        title="Inbound mail (IMAP)"
        description="Poll a shared mailbox and turn replies into ticket comments. New mail with no matching ticket opens a fresh one."
      />
      <PageBody className="grid max-w-2xl gap-4">
        <SettingsForm
          action={saveInboundSettings}
          fields={[
            { type: "switch", name: "IMAP_ENABLED", label: "Enable inbound polling", defaultChecked: enabled, hint: "Changes to the poll interval take effect on the next server start." },
            { type: "text", name: "IMAP_HOST", label: "Host", defaultValue: host ?? "", placeholder: "imap.example.com" },
            { type: "number", name: "IMAP_PORT", label: "Port", defaultValue: port ?? "993", placeholder: "993" },
            { type: "switch", name: "IMAP_SECURE", label: "Implicit TLS (port 993)", defaultChecked: secure },
            { type: "text", name: "IMAP_USER", label: "Username", defaultValue: user ?? "", placeholder: "support@example.com" },
            { type: "password", name: "IMAP_PASS", label: "Password", isSet: passSet },
            { type: "text", name: "IMAP_FOLDER", label: "Folder", defaultValue: folder ?? "INBOX", placeholder: "INBOX" },
            { type: "number", name: "IMAP_POLL_SECONDS", label: "Poll interval (seconds)", defaultValue: poll ?? "60", placeholder: "60" },
            { type: "switch", name: "MAIL_PLUS_ADDRESSING", label: "Match on plus-addressing (support+INC-123@…)", defaultChecked: plus },
          ]}
        />
        <p className="text-sm text-muted-foreground">
          Replies are matched to a ticket by their threading headers, a{" "}
          <code className="font-mono text-xs">[INC-123]</code> subject tag, or plus-addressing. See the{" "}
          <Link href="/settings/mail" className="text-primary hover:underline">mail log</Link> for received messages.
        </p>
      </PageBody>
    </>
  );
}
