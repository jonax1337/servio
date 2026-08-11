// Transport-agnostic shape of a received email. Whether it arrives via IMAP poll
// (lib/mail-inbound/imap.ts) or, later, a provider webhook, it is normalized to
// this and handed to processInboundMail (lib/mail-inbound/process.ts). Keeping the
// transport out of the processor is what lets a webhook slot in without a rewrite.

export type InboundAttachment = {
  filename: string;
  content: Buffer;
  contentType?: string;
};

export type ParsedInboundMail = {
  fromEmail: string;
  fromName?: string | null;
  to: string[];
  cc: string[];
  subject: string;
  text: string;
  html: string | null;
  messageId: string | null;
  inReplyTo: string | null;
  references: string[];
  date?: Date | null;
  /** Lower-cased header name → raw value, for loop detection / audit. */
  headers: Record<string, string>;
  attachments: InboundAttachment[];
};

export type InboundConfig = {
  host: string;
  port: number;
  secure: boolean;
  user: string;
  pass: string;
  folder: string;
  /** false → accept self-signed TLS (local test servers like GreenMail). */
  tlsRejectUnauthorized?: boolean;
};
