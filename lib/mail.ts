import { db } from "@/lib/db";
import { ticketRef } from "@/lib/constants";

/**
 * Pluggable mailer. If SMTP is configured it sends via nodemailer; otherwise it
 * runs in "outbox" mode (records the message as SENT so it can be previewed in
 * Settings › Mail). Every message is always recorded in the EmailMessage table.
 */

export function smtpConfigured() {
  return Boolean(process.env.SMTP_HOST && process.env.SMTP_PORT);
}

type SendInput = {
  to: string;
  toName?: string | null;
  subject: string;
  body: string;
  template?: string;
  entity?: string;
  entityId?: string | number;
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
    if (smtpConfigured()) {
      const nodemailer = await import("nodemailer");
      const transport = nodemailer.createTransport({
        host: process.env.SMTP_HOST,
        port: Number(process.env.SMTP_PORT ?? 587),
        secure: process.env.SMTP_SECURE === "true",
        auth: process.env.SMTP_USER
          ? { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS }
          : undefined,
      });
      await transport.sendMail({
        from: process.env.SMTP_FROM ?? "Servio <servio@localhost>",
        to: input.toName ? `${input.toName} <${input.to}>` : input.to,
        subject: input.subject,
        text: input.body,
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

export function tplTicketReply(t: TicketLike, snippet: string) {
  return {
    template: "ticket_reply",
    subject: `[${ticketRef(t.id, t.type)}] New update on your request`,
    body: `Hello,

There's a new update on your request ${ticketRef(t.id, t.type)} — "${t.title}":

  ${snippet}

Reply in the portal to continue the conversation.

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
