import { NextResponse } from "next/server";
import { getSessionUser } from "@/lib/session";
import { ProposalSchema } from "@/lib/portal-assistant";
import { createPortalTicketFor, createCatalogRequestFor, linkStagedAttachments } from "@/lib/portal-tickets";
import { ticketRef } from "@/lib/constants";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Confirm-to-create endpoint for the portal Vio widget. The user clicks
 * "Create request" on a draft Vio proposed; this re-validates that draft
 * server-side and creates a fully-routed ticket as the signed-in user —
 * either a free-form ticket or a filled catalog order.
 */
export async function POST(req: Request) {
  const me = await getSessionUser();
  if (!me) return NextResponse.json({ error: "unauthorised" }, { status: 401 });

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "invalid body" }, { status: 400 });
  }

  const parsed = ProposalSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "Please give the request a title and a short description first." }, { status: 400 });
  }

  const rawIds = (body as { attachmentIds?: unknown })?.attachmentIds;
  const attachmentIds = Array.isArray(rawIds) ? rawIds.map(String) : [];

  try {
    if (parsed.data.kind === "service") {
      const answers: Record<string, string> = {};
      for (const a of parsed.data.answers) answers[a.key] = a.value;
      const result = await createCatalogRequestFor(me, parsed.data.itemId, answers, "VIO");
      if (!result.ok) return NextResponse.json({ error: result.error }, { status: 400 });
      await linkStagedAttachments(me.id, result.ticket.id, attachmentIds);
      return NextResponse.json({
        ok: true,
        id: result.ticket.id,
        ref: ticketRef(result.ticket.id, result.ticket.prefix),
        url: `/portal/tickets/${result.ticket.id}`,
      });
    }

    const ticket = await createPortalTicketFor(me, {
      title: parsed.data.title,
      type: parsed.data.type,
      priority: parsed.data.priority,
      impact: parsed.data.impact,
      urgency: parsed.data.urgency,
      description: parsed.data.description,
      categoryId: parsed.data.categoryId ?? null,
      source: "VIO",
    });
    await linkStagedAttachments(me.id, ticket.id, attachmentIds);
    return NextResponse.json({
      ok: true,
      id: ticket.id,
      ref: ticketRef(ticket.id, ticket.prefix),
      url: `/portal/tickets/${ticket.id}`,
    });
  } catch (err) {
    console.error("[portal-assistant/create]", err);
    return NextResponse.json({ error: "Couldn't create the request. Please try the request form instead." }, { status: 500 });
  }
}
