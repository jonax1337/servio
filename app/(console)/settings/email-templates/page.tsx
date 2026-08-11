import type { Metadata } from "next";
import { MailCheck } from "lucide-react";
import { db } from "@/lib/db";
import { requireRole } from "@/lib/session";
import { mailBrand } from "@/lib/mail";
import { signatureHtml, textToHtmlParagraphs } from "@/lib/mail-template";
import {
  TEMPLATE_KEYS, TEMPLATE_META, DEFAULT_TEMPLATES, previewTemplate, type TemplateKey,
} from "@/lib/email-templates";
import { PageHeader, PageBody } from "@/components/page-header";
import { EmailTemplateEditor } from "@/components/settings/email-template-editor";

export const metadata: Metadata = { title: "Email templates" };
export const dynamic = "force-dynamic";

export default async function EmailTemplatesPage() {
  await requireRole("ADMIN");
  const [rows, brand] = await Promise.all([db.emailTemplate.findMany(), mailBrand()]);
  const byKey = new Map(rows.map((r) => [r.key, r]));

  // Sample data used to render the live previews.
  const sampleVars: Record<string, string> = {
    appName: brand.appName ?? "Servio",
    ref: "INC-0042",
    title: "Printer on the 2nd floor won't print",
    requesterName: "Max Sample",
    agentName: "Alex Admin",
    message: textToHtmlParagraphs("Hi Max,\n\nwe've ordered a replacement toner — it arrives tomorrow morning. I'll let you know as soon as the printer is back up."),
    signature: signatureHtml(textToHtmlParagraphs("Alex Admin\nService Desk")),
  };
  const ctx = { brand, vars: sampleVars };

  return (
    <>
      <PageHeader
        icon={MailCheck}
        title="Email templates"
        description="Customize the subject and content of the ticket emails users receive."
      />
      <PageBody className="grid max-w-3xl gap-5">
        {TEMPLATE_KEYS.map((key: TemplateKey) => {
          const row = byKey.get(key);
          const subject = row?.subject ?? DEFAULT_TEMPLATES[key].subject;
          const bodyHtml = row?.bodyHtml ?? DEFAULT_TEMPLATES[key].bodyHtml;
          const preview = previewTemplate({ subject, bodyHtml }, ctx);
          return (
            <EmailTemplateEditor
              key={key}
              templateKey={key}
              label={TEMPLATE_META[key].label}
              description={TEMPLATE_META[key].description}
              vars={TEMPLATE_META[key].vars}
              subject={subject}
              bodyHtml={bodyHtml}
              enabled={row?.enabled ?? true}
              customized={!!row}
              previewHtml={preview.html}
            />
          );
        })}
      </PageBody>
    </>
  );
}
