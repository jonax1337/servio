"use server";

import type { ModelMessage } from "ai";
import { db } from "@/lib/db";
import { getSessionUser, isAgent, type Role } from "@/lib/session";
import { aiConfigured, generateAiChat } from "@/lib/ai";
import { getTicketAiContext } from "@/lib/actions/ai";
import { getOrgDirectory } from "@/lib/ai-context";
import {
  AI_CHAT_TOOLS,
  resolveGroupId,
  resolveCategoryId,
  resolveAgentId,
  parseTicketId,
} from "@/lib/ai-tools";
import { updateTicketField, addTicketComment, linkTicket } from "@/lib/actions/tickets";
import { renderMarkdown } from "@/lib/markdown";
import { AI_ASSISTANT_NAME, TICKET_STATUSES, PRIORITIES, IMPACT_URGENCY } from "@/lib/constants";

export type ChatMessage = { role: "user" | "assistant"; content: string };

/** A change Vio proposes to the current ticket. Nothing runs until the agent approves. */
export type ChatProposal =
  | { id: string; kind: "update_field"; field: string; value: string; reason?: string; label: string }
  | { id: string; kind: "internal_note"; text: string; label: string }
  | { id: string; kind: "link_ticket"; target: string; relation?: string; label: string };

export type ChatState =
  | {
      ok: true;
      text: string;
      html: string;
      toolCalls: { name: string; input: unknown }[];
      proposals: ChatProposal[];
    }
  | { ok: false; error: string };

/**
 * The ticket AI chat agent. Answers about the current ticket and can use tools
 * (web_search, fetch_url) to look up external info. Runs entirely server-side.
 */
export async function chatWithAi(ticketId: number, history: ChatMessage[]): Promise<ChatState> {
  const me = await getSessionUser();
  if (!me || !isAgent(me.role as Role)) return { ok: false, error: "Not authorised" };
  if (!aiConfigured()) {
    return { ok: false, error: "AI is not configured." };
  }
  if (!Array.isArray(history) || history.length === 0) {
    return { ok: false, error: "Nothing to send." };
  }

  const context = await getTicketAiContext(ticketId);

  // Who you're talking to — so Vio treats the agent as a known colleague.
  const memberships = await db.groupMember.findMany({
    where: { userId: me.id },
    select: { group: { select: { name: true } } },
  });
  const teams = memberships.map((m) => m.group?.name).filter(Boolean);
  const orgName = process.env.APP_NAME || "Servio";
  const orgDirectory = await getOrgDirectory();

  const system = [
    `You are ${AI_ASSISTANT_NAME}, the AI assistant built into ${orgName}, an IT service management`,
    "system. You are an experienced ITSM engineer: knowledgeable, concise, specific, a real teammate.",
    "",
    "WHO YOU ARE HELPING:",
    `${me.name || "An agent"} (role ${me.role}${teams.length ? `, on team(s): ${teams.join(", ")}` : ""}` +
      `${me.email ? `, ${me.email}` : ""}). Treat them as a trusted colleague. When they say "we", "us"`,
    `or "our team", they mean ${orgName}'s IT / support staff (the internal side), not the requester.`,
    "",
    "CRITICAL: You and this agent ARE the IT / service desk. This IS IT's own system. So NEVER suggest",
    "'contact IT', 'escalate to IT', 'reach out to your IT department', or 'the IT team can help'. There",
    "is no external IT. When work needs routing, name a SPECIFIC team from the directory below, or point",
    "to a specific service OWNER or record. Be concrete, never generic.",
    "",
    "TOOLS you can call (prefer internal sources over the open web, and cite what you use):",
    "- search_knowledge_base: the org's own how-to / troubleshooting articles. Try this first.",
    "- search_tickets: past & current tickets (incl. comments) for similar issues and how they were handled.",
    "- search_problems: root-cause investigations & known errors (root cause / workaround).",
    "- search_changes: planned changes & maintenance (a recent change may have caused an incident).",
    "- web_search / fetch_url: the public web, only for facts not documented internally.",
    "",
    "ACTIONS on THIS ticket (these only PROPOSE a change; the agent approves each one live in the chat,",
    "nothing is applied on its own, so use them freely):",
    "- propose_update_field: change status, priority, impact, urgency, team, category, or assignee.",
    "- propose_internal_note: add an internal note (agents only).",
    "- propose_link_ticket: link this ticket to another one (duplicate / related / etc.).",
    "When the agent asks you to change, route, note, or link something, USE these tools to propose it",
    "(with a short reason). Propose each distinct change EXACTLY ONCE. IMPORTANT: these only propose;",
    "you cannot apply anything yourself. In your written reply, say you have PROPOSED the change(s) for",
    "the agent to approve below. NEVER say a change is 'done', 'applied', 'updated' or 'approved'.",
    "",
    "How to work: answer from the ticket context when you can. For 'has this happened before', a known",
    "error, a root cause, or a recent change, search tickets / problems / changes first, then the KB,",
    "then the web. Cite what you used (KB links, ticket/problem/change refs, source URLs). Never invent",
    "facts or fixes. Keep answers tight; use short markdown (bold, lists, links). Reply in the user's language.",
    "",
    "ORGANISATION DIRECTORY (real teams, services and categories):",
    orgDirectory,
    "",
    "CURRENT TICKET CONTEXT:",
    context ?? "(ticket context unavailable)",
  ].join("\n");

  // Bound the history so context stays manageable.
  const recent = history.slice(-16);
  const messages: ModelMessage[] = recent.map((m) =>
    m.role === "assistant" ? { role: "assistant", content: m.content } : { role: "user", content: m.content },
  );

  try {
    const { text, toolCalls } = await generateAiChat({
      system,
      messages,
      tools: AI_CHAT_TOOLS,
      maxSteps: 10,
    });
    const answer = text || "(no answer)";
    // Turn any propose_* tool calls into approval cards for the agent to confirm.
    const proposals = buildProposals(toolCalls);
    // Render markdown → sanitized HTML server-side (marked + DOMPurify stay off the
    // client bundle; links get target=_blank rel=noopener via the markdown hook).
    return { ok: true, text: answer, html: renderMarkdown(answer), toolCalls, proposals };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "AI request failed" };
  }
}

const FIELD_LABEL: Record<string, string> = {
  status: "status",
  priority: "priority",
  impact: "impact",
  urgency: "urgency",
  team: "team",
  category: "category",
  assignee: "assignee",
};

/** Extract the agent-approvable proposals from Vio's propose_* tool calls (deduped). */
function buildProposals(toolCalls: { name: string; input: unknown }[]): ChatProposal[] {
  const out: ChatProposal[] = [];
  const seen = new Set<string>();
  const push = (sig: string, p: ChatProposal) => {
    if (seen.has(sig)) return;
    seen.add(sig);
    out.push(p);
  };
  toolCalls.forEach((tc, i) => {
    const id = `pr${i}`;
    if (tc.name === "propose_update_field") {
      const inp = tc.input as { field: string; value: string; reason?: string };
      if (!inp?.field || !inp?.value) return;
      push(`f:${inp.field}:${inp.value}`.toLowerCase(), {
        id,
        kind: "update_field",
        field: inp.field,
        value: inp.value,
        reason: inp.reason,
        label: `Set ${FIELD_LABEL[inp.field] ?? inp.field} to “${inp.value}”`,
      });
    } else if (tc.name === "propose_internal_note") {
      const inp = tc.input as { text: string };
      if (!inp?.text) return;
      push(`n:${inp.text}`.slice(0, 80).toLowerCase(), { id, kind: "internal_note", text: inp.text, label: "Add internal note" });
    } else if (tc.name === "propose_link_ticket") {
      const inp = tc.input as { target: string; relation?: string };
      if (!inp?.target) return;
      push(`l:${inp.target}`.toLowerCase(), { id, kind: "link_ticket", target: inp.target, relation: inp.relation, label: `Link to ${inp.target}` });
    }
  });
  return out;
}

/**
 * Apply a proposal the agent approved in the chat. Re-validates everything
 * server-side (never trust the client) and reuses the real ticket actions so
 * audit / notifications / SLA / automations all run.
 */
export async function applyTicketProposal(
  ticketId: number,
  p: ChatProposal,
): Promise<{ ok: boolean; applied?: string; error?: string }> {
  const me = await getSessionUser();
  if (!me || !isAgent(me.role as Role)) return { ok: false, error: "Not authorised" };
  if (!Number.isInteger(ticketId)) return { ok: false, error: "Bad ticket" };

  try {
    if (p.kind === "internal_note") {
      const text = String(p.text ?? "").trim();
      if (!text) return { ok: false, error: "Empty note" };
      const fd = new FormData();
      fd.set("ticketId", String(ticketId));
      fd.set("isInternal", "on");
      fd.set("bodyHtml", renderMarkdown(text));
      await addTicketComment(fd);
      return { ok: true, applied: "Internal note added" };
    }

    if (p.kind === "link_ticket") {
      const targetId = parseTicketId(p.target);
      if (!targetId) return { ok: false, error: `Cannot resolve ${p.target}` };
      if (targetId === ticketId) return { ok: false, error: "Cannot link a ticket to itself" };
      const fd = new FormData();
      fd.set("id", String(ticketId));
      fd.set("targetId", String(targetId));
      fd.set("type", p.relation ?? "RELATED");
      await linkTicket(fd);
      return { ok: true, applied: `Linked to ${p.target}` };
    }

    // update_field: resolve/validate, mutate via updateTicketField, then verify it stuck.
    const field = p.field;
    let realField: string;
    let realValue: string;
    if (field === "status" || field === "priority" || field === "impact" || field === "urgency") {
      const enums = { status: TICKET_STATUSES, priority: PRIORITIES, impact: IMPACT_URGENCY, urgency: IMPACT_URGENCY }[field] as readonly string[];
      realValue = String(p.value).trim().toUpperCase();
      if (!enums.includes(realValue)) return { ok: false, error: `Invalid ${field}: ${p.value}` };
      realField = field;
    } else if (field === "team") {
      const g = await resolveGroupId(p.value);
      if (!g) return { ok: false, error: `Team not found: ${p.value}` };
      realField = "groupId";
      realValue = g.id;
    } else if (field === "category") {
      const c = await resolveCategoryId(p.value);
      if (!c) return { ok: false, error: `Category not found: ${p.value}` };
      realField = "categoryId";
      realValue = c.id;
    } else if (field === "assignee") {
      const u = await resolveAgentId(p.value);
      if (!u) return { ok: false, error: `Agent not found: ${p.value}` };
      realField = "assigneeId";
      realValue = u.id;
    } else {
      return { ok: false, error: `Unknown field: ${field}` };
    }

    const fd = new FormData();
    fd.set("id", String(ticketId));
    fd.set("field", realField);
    fd.set("value", realValue);
    await updateTicketField(fd);

    // Verify the change actually took (updateTicketField silently no-ops on invalid
    // status transitions etc.), so the agent gets honest feedback.
    const after = await db.ticket.findUnique({
      where: { id: ticketId },
      select: { status: true, priority: true, impact: true, urgency: true, groupId: true, categoryId: true, assigneeId: true },
    });
    const current = after ? (after as Record<string, unknown>)[realField] : undefined;
    if (String(current ?? "") !== realValue) {
      return { ok: false, error: `Change was rejected (e.g. an invalid ${field} transition).` };
    }
    return { ok: true, applied: p.label };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "Could not apply the change" };
  }
}
