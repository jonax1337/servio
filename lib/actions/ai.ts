"use server";

import { z } from "zod";
import { db } from "@/lib/db";
import { getSessionUser, isAgent, type Role } from "@/lib/session";
import { getFormOptions } from "@/lib/data/options";
import { aiConfigured, generateAiText, generateAiObject } from "@/lib/ai";
import { PRIORITIES } from "@/lib/constants";

/** Only agents/managers/admins may use the AI console (mirrors tickets.ts). */
async function requireAgent() {
  const me = await getSessionUser();
  if (!me || !isAgent(me.role as Role)) return null;
  return me;
}

const NOT_CONFIGURED =
  "AI is not configured. Set AI_PROVIDER (and, for external providers, AI_ALLOW_EXTERNAL=true plus the API key).";

/** Collapse whitespace for prompting. Ticket rows already carry a plaintext twin. */
function plain(s: string | null | undefined): string {
  return (s ?? "").replace(/\s+/g, " ").trim();
}

/** Load a ticket + its comment thread by exact field names. */
async function loadTicketContext(id: number) {
  return db.ticket.findUnique({
    where: { id },
    include: {
      requester: { select: { name: true, email: true } },
      assignee: { select: { name: true } },
      category: { select: { name: true } },
      group: { select: { name: true } },
      comments: {
        orderBy: { createdAt: "asc" },
        select: {
          body: true,
          isInternal: true,
          createdAt: true,
          author: { select: { name: true } },
        },
      },
    },
  });
}

type TicketContext = NonNullable<Awaited<ReturnType<typeof loadTicketContext>>>;

/** Render ticket + comments into a compact transcript for the model. */
function renderTicket(t: TicketContext): string {
  const header = [
    `Title: ${t.title}`,
    `Type: ${t.type}`,
    `Status: ${t.status}`,
    `Priority: ${t.priority}`,
    `Impact: ${t.impact}  Urgency: ${t.urgency}`,
    `Requester: ${t.requester?.name ?? "Unknown"}`,
    t.category ? `Category: ${t.category.name}` : null,
    t.group ? `Team: ${t.group.name}` : null,
    "",
    "Description:",
    plain(t.description),
  ]
    .filter(Boolean)
    .join("\n");

  const thread = t.comments
    .map((c) => {
      const who = c.author?.name ?? "Unknown";
      const vis = c.isInternal ? "internal note" : "reply";
      return `[${who} — ${vis}] ${plain(c.body)}`;
    })
    .join("\n");

  return thread ? `${header}\n\nDiscussion:\n${thread}` : header;
}

/* ── 1. suggestTriage — generateObject constrained to REAL category/team ids ── */

export type TriageState =
  | {
      ok: true;
      priority: (typeof PRIORITIES)[number];
      groupId: string | null;
      categoryId: string | null;
      reasoning: string;
    }
  | { ok: false; error: string };

export async function suggestTriage(ticketId: number): Promise<TriageState> {
  const me = await requireAgent();
  if (!me) return { ok: false, error: "Not authorised" };
  if (!aiConfigured()) return { ok: false, error: NOT_CONFIGURED };

  const ticket = await loadTicketContext(ticketId);
  if (!ticket) return { ok: false, error: "Ticket not found" };

  // Valid id sets (cached round-trip). categories/groups are string cuids.
  const { categories, groups } = await getFormOptions();
  const catIds = categories.map((c) => c.id);
  const groupIds = groups.map((g) => g.id);

  // Enums built from the real ids → the model can't return a nonexistent id.
  const categoryEnum =
    catIds.length > 0 ? z.enum(["none", ...catIds] as [string, ...string[]]) : z.literal("none");
  const groupEnum =
    groupIds.length > 0 ? z.enum(["none", ...groupIds] as [string, ...string[]]) : z.literal("none");

  const schema = z.object({
    priority: z.enum(PRIORITIES),
    categoryId: categoryEnum,
    groupId: groupEnum,
    reasoning: z.string(),
  });

  const catLegend = categories.map((c) => `- ${c.id}: ${c.name}`).join("\n") || "(none)";
  const groupLegend = groups.map((g) => `- ${g.id}: ${g.name}`).join("\n") || "(none)";

  const system =
    "You are an ITSM triage assistant. Classify the ticket. You MUST choose a priority " +
    "from the allowed set, and choose a categoryId and groupId ONLY from the provided id " +
    'legends (or "none" if nothing fits). Return concise reasoning (1-3 sentences).';

  const prompt = [
    `Allowed priorities: ${PRIORITIES.join(", ")}`,
    "",
    `Category ids (id: name):\n${catLegend}`,
    "",
    `Team/Group ids (id: name):\n${groupLegend}`,
    "",
    `Ticket:\n${renderTicket(ticket)}`,
  ].join("\n");

  try {
    const out = await generateAiObject({ system, prompt, schema });

    // Belt-and-suspenders: re-validate ids against the real sets (weaker local
    // models may not hard-enforce the JSON schema).
    const categoryId =
      out.categoryId !== "none" && catIds.includes(out.categoryId) ? out.categoryId : null;
    const groupId =
      out.groupId !== "none" && groupIds.includes(out.groupId) ? out.groupId : null;

    return {
      ok: true,
      priority: out.priority,
      categoryId,
      groupId,
      reasoning: plain(out.reasoning),
    };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "AI request failed" };
  }
}

/* ── 2. summarizeThread — concise summary of ticket + comments ── */

export type AiTextState = { ok: true; text: string } | { ok: false; error: string };

export async function summarizeThread(ticketId: number): Promise<AiTextState> {
  const me = await requireAgent();
  if (!me) return { ok: false, error: "Not authorised" };
  if (!aiConfigured()) return { ok: false, error: NOT_CONFIGURED };

  const ticket = await loadTicketContext(ticketId);
  if (!ticket) return { ok: false, error: "Ticket not found" };

  const system =
    "You summarise ITSM tickets for support agents. Produce a concise summary: the core " +
    "problem, what has been tried, current status, and the next action. Use short bullets " +
    "or paragraphs. Reply in the ticket's language. No preamble.";

  try {
    const text = await generateAiText({
      system,
      prompt: `Summarise this ticket and its discussion:\n\n${renderTicket(ticket)}`,
    });
    return { ok: true, text };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "AI request failed" };
  }
}

/* ── 3. draftReply — suggested reply draft (language-matching) ── */

export async function draftReply(ticketId: number): Promise<AiTextState> {
  const me = await requireAgent();
  if (!me) return { ok: false, error: "Not authorised" };
  if (!aiConfigured()) return { ok: false, error: NOT_CONFIGURED };

  const ticket = await loadTicketContext(ticketId);
  if (!ticket) return { ok: false, error: "Ticket not found" };

  const system =
    "You are a support agent drafting a reply to the requester. Write a clear, courteous, " +
    "actionable reply based on the ticket and its discussion. IMPORTANT: reply in the SAME " +
    "LANGUAGE as the requester (German if they wrote German). Do not invent facts not present " +
    "in the ticket. No subject line — just the message body.";

  try {
    const text = await generateAiText({
      system,
      prompt: `Draft a reply to the requester for this ticket:\n\n${renderTicket(ticket)}`,
    });
    return { ok: true, text };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "AI request failed" };
  }
}

/* ── 4. improveText — improve an agent's typed reply (optional tone) ── */

const TONES = ["neutral", "friendly", "formal", "concise", "apologetic"] as const;
export type Tone = (typeof TONES)[number];

export async function improveText(
  draft: string,
  opts?: { tone?: Tone },
): Promise<AiTextState> {
  const me = await requireAgent();
  if (!me) return { ok: false, error: "Not authorised" };
  if (!aiConfigured()) return { ok: false, error: NOT_CONFIGURED };

  if (plain(draft).length < 2) return { ok: false, error: "Nothing to improve." };

  const tone = opts?.tone && TONES.includes(opts.tone) ? opts.tone : "neutral";

  const system =
    "You improve support-agent replies. Fix grammar and clarity, keep the meaning and all " +
    "facts, and keep the ORIGINAL LANGUAGE (German stays German). " +
    `Apply a ${tone} tone. Return ONLY the improved text, no commentary.`;

  try {
    const text = await generateAiText({ system, prompt: `Improve this reply:\n\n${draft}` });
    return { ok: true, text };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "AI request failed" };
  }
}
