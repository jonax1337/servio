import { ImapFlow } from "imapflow";
import { simpleParser, type AddressObject } from "mailparser";
import type { InboundConfig, ParsedInboundMail } from "./types";

/**
 * Poll a mailbox over IMAP for UNSEEN messages, parse each to a ParsedInboundMail,
 * and hand it to `onMail`. A message is flagged \Seen only after `onMail` resolves,
 * so a crash mid-processing leaves the mail to be retried on the next poll (the
 * processor dedupes on Message-ID, so a double delivery is harmless).
 *
 * Node-only (net/tls). Never import from a client component.
 */
export async function pollImap(
  config: InboundConfig,
  onMail: (mail: ParsedInboundMail) => Promise<void>,
): Promise<{ processed: number; failed: number }> {
  const client = new ImapFlow({
    host: config.host,
    port: config.port,
    secure: config.secure,
    auth: { user: config.user, pass: config.pass },
    tls: { rejectUnauthorized: config.tlsRejectUnauthorized !== false },
    logger: false,
  });

  let processed = 0;
  let failed = 0;

  await client.connect();
  try {
    const lock = await client.getMailboxLock(config.folder || "INBOX");
    try {
      // Collect UIDs first so flag changes during iteration don't disturb the set.
      const uids: number[] = [];
      for await (const msg of client.fetch({ seen: false }, { uid: true })) {
        uids.push(msg.uid);
      }
      for (const uid of uids) {
        try {
          const { content } = await client.download(String(uid), undefined, { uid: true });
          const raw = await streamToBuffer(content);
          const mail = await parseRaw(raw);
          await onMail(mail);
          await client.messageFlagsAdd(String(uid), ["\\Seen"], { uid: true });
          processed++;
        } catch {
          failed++;
          // Leave it UNSEEN — it'll be retried next poll.
        }
      }
    } finally {
      lock.release();
    }
  } finally {
    await client.logout().catch(() => {});
  }

  return { processed, failed };
}

/** Parse a raw RFC 5322 message into our transport-agnostic shape. */
export async function parseRaw(raw: Buffer | string): Promise<ParsedInboundMail> {
  const p = await simpleParser(raw);
  const headers: Record<string, string> = {};
  for (const [k, v] of p.headers) headers[k.toLowerCase()] = typeof v === "string" ? v : String((v as { text?: string })?.text ?? "");

  const from = p.from?.value?.[0];
  const refs = p.references;
  return {
    fromEmail: (from?.address ?? "").toLowerCase(),
    fromName: from?.name || null,
    to: addrList(p.to),
    cc: addrList(p.cc),
    subject: p.subject ?? "",
    text: p.text ?? "",
    html: typeof p.html === "string" ? p.html : null,
    messageId: p.messageId ?? null,
    inReplyTo: p.inReplyTo ?? null,
    references: Array.isArray(refs) ? refs : refs ? [refs] : [],
    date: p.date ?? null,
    headers,
    attachments: (p.attachments ?? [])
      .filter((a) => a.content && (a.contentDisposition !== "inline" || a.filename))
      .map((a) => ({
        filename: a.filename || "attachment",
        content: a.content as Buffer,
        contentType: a.contentType,
      })),
  };
}

function addrList(obj: AddressObject | AddressObject[] | undefined): string[] {
  if (!obj) return [];
  const arr = Array.isArray(obj) ? obj : [obj];
  const out: string[] = [];
  for (const a of arr) for (const v of a.value ?? []) if (v.address) out.push(v.address.toLowerCase());
  return out;
}

async function streamToBuffer(stream: NodeJS.ReadableStream): Promise<Buffer> {
  const chunks: Buffer[] = [];
  for await (const chunk of stream) chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
  return Buffer.concat(chunks);
}
