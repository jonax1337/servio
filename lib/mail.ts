import { db } from "@/lib/db";
import { storage } from "@/lib/storage";
import { ticketRef } from "@/lib/constants";
import { getSetting } from "@/lib/settings";

/**
 * Pluggable mailer. If SMTP is configured it sends via nodemailer; otherwise it
 * runs in "outbox" mode (records the message as SENT so it can be previewed in
 * Settings › Mail). Every message is always recorded in the EmailMessage table.
 */

export async function smtpConfigured() {
  const [host, port] = await Promise.all([
    getSetting("SMTP_HOST"),
    getSetting("SMTP_PORT"),
  ]);
  return Boolean(host && port);
}

type SendInput = {
  to: string;
  toName?: string | null;
  subject: string;
  body: string;
  template?: string;
  entity?: string;
  entityId?: string | number;
  /** Stored blobs to attach (read from storage at send time). */
  attachments?: { filename: string; storageKey: string }[];
};

export async function sendMail(input: SendInput): Promise<void> {
  const msg = await db.emailMessage.create({
    data: {
      toEmail: input.to,
      toName: input.toName ?? null,
      subject: input.subject,
      body: input.body,
      template: input.template ?? "generic",
      entity: input.entity,
      entityId: input.entityId != null ? String(input.entityId) : null,
      status: "QUEUED",
    },
  });

  try {
    if (await smtpConfigured()) {
      const [host, port, secure, user, pass, from] = await Promise.all([
        getSetting("SMTP_HOST"),
        getSetting("SMTP_PORT"),
        getSetting("SMTP_SECURE"),
        getSetting("SMTP_USER"),
        getSetting("SMTP_PASS"), // secret — stored encrypted, decrypted on read
        getSetting("SMTP_FROM"),
      ]);
      const nodemailer = await import("nodemailer");
      const transport = nodemailer.createTransport({
        host: host ?? undefined,
        port: Number(port ?? 587),
        secure: secure === "true",
        auth: user ? { user, pass: pass ?? undefined } : undefined,
      });
      // Read stored blobs into stream attachments for nodemailer.
      const mailAttachments = input.attachments?.length
        ? await Promise.all(
            input.attachments.map(async (a) => ({ filename: a.filename, content: (await storage.get(a.storageKey)).body })),
          )
        : undefined;
      await transport.sendMail({
        from: from ?? "Servio <servio@localhost>",
        to: input.toName ? `${input.toName} <${input.to}>` : input.to,
        subject: input.subject,
        text: input.body,
        attachments: mailAttachments,
      });
    }
    // No SMTP configured → simulated delivery (visible in the outbox).
    await db.emailMessage.update({
      where: { id: msg.id },
      data: { status: "SENT", sentAt: new Date() },
    });
  } catch (e) {
    await db.emailMessage.update({
      where: { id: msg.id },
      data: { status: "FAILED", error: e instanceof Error ? e.message : String(e) },
    });
  }
}

// ── Templates ────────────────────────────────────────────────────────────
const FROM_NAME = "Servio Service Desk";

type TicketLike = { id: number; title: string; type: string; status: string };

export function tplTicketReceived(t: TicketLike) {
  return {
    template: "ticket_received",
    subject: `[${ticketRef(t.id, t.type)}] We received your request`,
    body: `Hello,

Thanks for contacting the ${FROM_NAME}. Your request has been logged as ${ticketRef(t.id, t.type)}:

  "${t.title}"

Our team will review it shortly. You can track its progress any time in the self-service portal.

— ${FROM_NAME}`,
  };
}

export function tplTicketAssigned(t: TicketLike, agentName: string) {
  return {
    template: "ticket_assigned",
    subject: `[${ticketRef(t.id, t.type)}] Assigned to you`,
    body: `Hi ${agentName},

Ticket ${ticketRef(t.id, t.type)} — "${t.title}" — has been assigned to you.

Please review and take the next step.

— ${FROM_NAME}`,
  };
}

export function tplTicketReply(t: TicketLike, snippet: string, signatureText?: string) {
  const sig = signatureText?.trim() ? `\n\n${signatureText.trim()}` : "";
  return {
    template: "ticket_reply",
    subject: `[${ticketRef(t.id, t.type)}] New update on your request`,
    body: `Hello,

There's a new update on your request ${ticketRef(t.id, t.type)} — "${t.title}":

  ${snippet}${sig}

Reply in the portal to continue the conversation.

— ${FROM_NAME}`,
  };
}

export function tplTicketParticipant(t: TicketLike, name: string, addedBy: string, note: string) {
  return {
    template: "ticket_participant",
    subject: `[${ticketRef(t.id, t.type)}] You were added to a ticket`,
    body: `Hi ${name},

${addedBy} added you as a participant on ${ticketRef(t.id, t.type)} — "${t.title}".
${note ? `\nNote: ${note}\n` : ""}
You'll now receive updates on this ticket in Servio.

— ${FROM_NAME}`,
  };
}

export function tplTicketResolved(t: TicketLike) {
  return {
    template: "ticket_resolved",
    subject: `[${ticketRef(t.id, t.type)}] Your request has been resolved`,
    body: `Hello,

Good news — your request ${ticketRef(t.id, t.type)} — "${t.title}" — has been marked as resolved.

If the issue persists, reply in the portal to re-open it.

— ${FROM_NAME}`,
  };
}
