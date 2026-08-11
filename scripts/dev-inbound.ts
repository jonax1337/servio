/**
 * Dev-only: feed a fake (or real .eml) inbound email straight into the inbound
 * processor, so you can watch mail → ticket threading work WITHOUT a live mailbox.
 *
 *   pnpm exec tsx --env-file=.env scripts/dev-inbound.ts                       # new EMAIL ticket
 *   pnpm exec tsx --env-file=.env scripts/dev-inbound.ts --ticket 12           # reply onto ticket 12 (threaded)
 *   pnpm exec tsx --env-file=.env scripts/dev-inbound.ts --eml path/to/file.eml
 *
 * Other flags: --from, --name, --to, --cc a,b, --subject, --text
 */
import { readFileSync } from "node:fs";
import { db } from "@/lib/db";
import { processInboundMail } from "@/lib/mail-inbound/process";
import { parseRaw } from "@/lib/mail-inbound/imap";
import type { ParsedInboundMail } from "@/lib/mail-inbound/types";

function arg(name: string): string | undefined {
  const i = process.argv.indexOf(`--${name}`);
  return i >= 0 ? process.argv[i + 1] : undefined;
}

async function main() {
  const emlPath = arg("eml");
  let mail: ParsedInboundMail;

  if (emlPath) {
    mail = await parseRaw(readFileSync(emlPath));
  } else {
    const from = (arg("from") ?? "customer@example.com").toLowerCase();
    const ticketIdArg = arg("ticket");
    let subject = arg("subject") ?? "Need help with my laptop";
    let inReplyTo: string | null = null;
    let references: string[] = [];

    if (ticketIdArg) {
      const tid = Number(ticketIdArg);
      const root = await db.emailMessage.findFirst({
        where: { ticketId: tid, messageId: { not: null }, direction: "OUTBOUND" },
        orderBy: { createdAt: "asc" },
        select: { messageId: true, subject: true },
      });
      if (!root?.messageId) {
        throw new Error(
          `No outbound thread-root email found for ticket ${tid}. Create the ticket (which sends a confirmation) first, or omit --ticket to open a new one.`,
        );
      }
      inReplyTo = root.messageId;
      references = [root.messageId];
      subject = `Re: ${root.subject}`;
    }

    mail = {
      fromEmail: from,
      fromName: arg("name") ?? "Test Customer",
      to: [arg("to") ?? "support@example.com"],
      cc: (arg("cc") ?? "").split(",").map((s) => s.trim()).filter(Boolean),
      subject,
      text: arg("text") ?? "Hi team,\n\nThis is a test inbound email. Please advise.\n\nThanks!",
      html: null,
      messageId: `<demo-${Date.now()}@example.com>`,
      inReplyTo,
      references,
      date: new Date(),
      headers: {},
      attachments: [],
    };
  }

  console.log("→ feeding inbound mail:", { from: mail.fromEmail, subject: mail.subject, inReplyTo: mail.inReplyTo });
  const result = await processInboundMail(mail);
  console.log("← result:", result);
  await db.$disconnect();
}

main().catch(async (e) => {
  console.error(e);
  await db.$disconnect().catch(() => {});
  process.exit(1);
});
