import { tool } from "ai";
import { z } from "zod";
import type { ModelMessage } from "ai";
import { db } from "@/lib/db";
import { generateAiChat } from "@/lib/ai";
import { webSearchTool, fetchUrlTool } from "@/lib/ai-tools";
import { parseFormSchema } from "@/lib/service-forms";
import { TICKET_TYPES, PRIORITIES, IMPACT_URGENCY } from "@/lib/constants";

/**
 * Vio for the Self-Service Portal — an END-USER assistant.
 *
 * Safer and smaller than the agent-console Vio (lib/ai-tools.ts): the read tools
 * only touch PUBLIC, PUBLISHED content plus the keyless, SSRF-guarded web tools.
 * The two "write" paths (propose_request / propose_service_request) never mutate
 * on their own — they return a draft the user confirms with one click in the
 * widget, which then routes it exactly like the hand-filled forms.
 */

const portalKnowledgeTool = tool({
  description:
    "Search the public help center (published, public knowledge-base articles) for guides and answers. Use this FIRST for any 'how do I…' or troubleshooting question. Only returns articles end users are allowed to read.",
  inputSchema: z.object({ query: z.string().describe("keywords to search help articles for") }),
  execute: async ({ query }) => {
    const rows = await db.article.findMany({
      where: {
        status: "PUBLISHED",
        visibility: "PUBLIC",
        OR: [{ title: { contains: query } }, { excerpt: { contains: query } }, { body: { contains: query } }],
      },
      take: 5,
      orderBy: { views: "desc" },
      select: { title: true, slug: true, excerpt: true },
    });
    return rows.length
      ? rows.map((r) => ({ title: r.title, url: `/portal/knowledge/${r.slug}`, excerpt: r.excerpt ?? "" }))
      : [{ title: "No matching articles", url: "", excerpt: "" }];
  },
});

const portalCatalogTool = tool({
  description:
    "Search the service catalog (published, requestable services: hardware, access, software, onboarding, etc.). Use when the user wants to REQUEST or GET something. Returns each service's id, a link, whether it needs approval, and whether it has a request form.",
  inputSchema: z.object({ query: z.string().describe("keywords to search the catalog for") }),
  execute: async ({ query }) => {
    const rows = await db.catalogItem.findMany({
      where: {
        isPublished: true,
        OR: [{ name: { contains: query } }, { shortDescription: { contains: query } }, { description: { contains: query } }],
      },
      take: 5,
      orderBy: [{ order: "asc" }, { name: "asc" }],
      select: { id: true, name: true, shortDescription: true, description: true, requiresApproval: true, formSchema: true },
    });
    return rows.length
      ? rows.map((r) => ({
          id: r.id,
          name: r.name,
          url: `/portal/request/${r.id}`,
          description: r.shortDescription ?? r.description ?? "",
          requiresApproval: r.requiresApproval,
          hasForm: parseFormSchema(r.formSchema).length > 0,
        }))
      : [{ id: "", name: "No matching services", url: "", description: "", requiresApproval: false, hasForm: false }];
  },
});

const listCategoriesTool = tool({
  description:
    "List the ticket categories so you can tag a request with the best-fitting one (helps it get routed and organised). Call this before propose_request when you're unsure which category fits.",
  inputSchema: z.object({}),
  execute: async () => {
    const rows = await db.category.findMany({ orderBy: { name: "asc" }, select: { id: true, name: true } });
    return rows.length ? rows : [{ id: "", name: "No categories" }];
  },
});

const getServiceFormTool = tool({
  description:
    "Get the request form fields for a catalog service (by its id from search_catalog). Returns each field's key, label, type, whether it's required, and any select options. Use this so you know exactly what to ask the user before filling the form.",
  inputSchema: z.object({ itemId: z.string().describe("the catalog item id from search_catalog") }),
  execute: async ({ itemId }) => {
    const item = await db.catalogItem.findUnique({ where: { id: itemId }, select: { name: true, formSchema: true, isPublished: true } });
    if (!item || !item.isPublished) return { ok: false, error: "That service isn't available." };
    const fields = parseFormSchema(item.formSchema);
    return {
      ok: true,
      service: item.name,
      fields: fields.map((f) => ({ key: f.key, label: f.label, type: f.type, required: !!f.required, options: f.options ?? [] })),
    };
  },
});

const proposeRequestTool = tool({
  description:
    "PROPOSE creating a free-form request/ticket (an issue to fix or a simple ask) so it gets logged and routed. This does NOT create anything yet — it drafts a request the user confirms with one click. Only call once you have a clear title AND a helpful description. Set a fitting categoryId from list_categories when you can.",
  inputSchema: z.object({
    title: z.string().describe("short one-line summary (min 3 chars)"),
    type: z.enum(TICKET_TYPES).describe("INCIDENT for a problem, REQUEST to obtain something"),
    priority: z.enum(PRIORITIES).describe("LOW, MEDIUM, HIGH or CRITICAL — default MEDIUM"),
    impact: z.enum(IMPACT_URGENCY).describe("how widely this affects people: LOW = just this user, MEDIUM = a team, HIGH = many/all"),
    urgency: z.enum(IMPACT_URGENCY).describe("how time-sensitive: LOW = whenever, MEDIUM = soon, HIGH = blocking work now"),
    description: z.string().describe("a clear description of the problem or request in the user's words"),
    categoryId: z.string().optional().describe("best-matching category id from list_categories, if any"),
  }),
  execute: async ({ title }) => ({ ok: true, drafted: `Prepared a request: "${title}" for the user to confirm.` }),
});

const proposeServiceRequestTool = tool({
  description:
    "PROPOSE ordering a catalog service on the user's behalf, with its request form filled in. Use for catalog items that have a form (hasForm=true). Fill answers using the fields from get_service_form. This does NOT submit anything — it drafts the order for the user to confirm. Make sure every required field has an answer.",
  inputSchema: z.object({
    itemId: z.string().describe("the catalog item id from search_catalog"),
    answers: z
      .array(z.object({ key: z.string().describe("the field key"), value: z.string().describe("the user's answer") }))
      .describe("one entry per form field you have an answer for"),
  }),
  execute: async ({ itemId }) => ({ ok: true, drafted: `Prepared a catalog order (${itemId}) for the user to confirm.` }),
});

export const PORTAL_ASSISTANT_TOOLS = {
  search_knowledge: portalKnowledgeTool,
  search_catalog: portalCatalogTool,
  list_categories: listCategoriesTool,
  get_service_form: getServiceFormTool,
  web_search: webSearchTool,
  fetch_url: fetchUrlTool,
  propose_request: proposeRequestTool,
  propose_service_request: proposeServiceRequestTool,
};

const SYSTEM_PROMPT = `You are Vio, the friendly assistant in the Servio Help Center. You help employees and customers get unblocked quickly, and you can act on their behalf.

Who you are talking to: a non-technical end user. Be warm, calm, and plain-spoken. No jargon. Keep answers short — usually two to four sentences or a tight bulleted list.

What you can do, in order of preference:
1. ANSWER: for a problem or "how do I…" question, call search_knowledge first and answer from it, linking the article by its url, e.g. [Reset your password](/portal/knowledge/reset-password). If the help center has nothing and it's a general how-to, you may use web_search (and fetch_url to read a result) and give a short, safe answer, noting it's from the public web.
2. GUIDE TO A SERVICE: when the user wants to obtain something, call search_catalog and point them to the matching service.
3. FILL A FORM FOR THEM: if that service has a request form (hasForm=true), call get_service_form, ask the user for any required fields you don't already know, then call propose_service_request with the answers so they can confirm and submit in one click.
4. OPEN A REQUEST: if the issue needs a person and isn't a catalog service, gather a clear title and short description, optionally call list_categories to pick a fitting categoryId, then call propose_request. Use INCIDENT for problems, REQUEST to obtain something. Judge impact (how many people are affected: just them, a team, or many) and urgency (how time-sensitive it is) from what the user tells you, and set priority accordingly (MEDIUM by default; CRITICAL only for outages or many blocked users).

Hard rules:
- Only mention articles or services the tools actually returned. Never invent titles, links, ids, or facts.
- You can only see public help articles and the catalog. You cannot see ticket queues, other people's tickets, accounts, or internal system details.
- A propose_* call only DRAFTS — the user still confirms. Don't claim something is done until they've confirmed.
- Ask for missing required details before proposing; never guess required form answers.
- Always answer in the user's language.
- Write in clean plain text: no emojis, and use normal punctuation (hyphens, not em-dashes).`;

const MAX_TURNS = 12;

/* ── Proposal shapes surfaced to the widget and validated at create time ── */

export const TicketProposalSchema = z.object({
  kind: z.literal("ticket"),
  title: z.string().min(3).max(140),
  type: z.enum(TICKET_TYPES),
  priority: z.enum(PRIORITIES).catch("MEDIUM"),
  impact: z.enum(IMPACT_URGENCY).catch("MEDIUM"),
  urgency: z.enum(IMPACT_URGENCY).catch("MEDIUM"),
  description: z.string().max(4000).default(""),
  categoryId: z.string().nullish(),
  categoryName: z.string().nullish(),
});

export const ServiceProposalSchema = z.object({
  kind: z.literal("service"),
  itemId: z.string().min(1),
  itemName: z.string(),
  requiresApproval: z.boolean().default(false),
  answers: z.array(z.object({ key: z.string(), label: z.string(), value: z.string() })).max(40).default([]),
});

export const ProposalSchema = z.discriminatedUnion("kind", [TicketProposalSchema, ServiceProposalSchema]);
export type RequestProposal = z.infer<typeof ProposalSchema>;

async function buildTicketProposal(input: unknown): Promise<RequestProposal | null> {
  const raw = z
    .object({
      title: z.string().min(3),
      type: z.enum(TICKET_TYPES),
      priority: z.enum(PRIORITIES).catch("MEDIUM"),
      impact: z.enum(IMPACT_URGENCY).catch("MEDIUM"),
      urgency: z.enum(IMPACT_URGENCY).catch("MEDIUM"),
      description: z.string().default(""),
      categoryId: z.string().nullish(),
    })
    .safeParse(input);
  if (!raw.success) return null;
  let categoryName: string | null = null;
  if (raw.data.categoryId) {
    const cat = await db.category.findUnique({ where: { id: raw.data.categoryId }, select: { name: true } });
    categoryName = cat?.name ?? null;
    if (!cat) raw.data.categoryId = null; // drop an invented/stale id
  }
  return { kind: "ticket", categoryName, ...raw.data };
}

async function buildServiceProposal(input: unknown): Promise<RequestProposal | null> {
  const raw = z
    .object({ itemId: z.string().min(1), answers: z.array(z.object({ key: z.string(), value: z.string() })).default([]) })
    .safeParse(input);
  if (!raw.success) return null;
  const item = await db.catalogItem.findUnique({
    where: { id: raw.data.itemId },
    select: { name: true, formSchema: true, isPublished: true, requiresApproval: true },
  });
  if (!item || !item.isPublished) return null;
  const fields = parseFormSchema(item.formSchema);
  const byKey = new Map(raw.data.answers.map((a) => [a.key, a.value]));
  const answers = fields.map((f) => ({ key: f.key, label: f.label, value: byKey.get(f.key) ?? "" }));
  return { kind: "service", itemId: raw.data.itemId, itemName: item.name, requiresApproval: item.requiresApproval, answers };
}

/** Run one portal-assistant turn. Returns the answer text and an optional draft
 *  (a ticket or a filled catalog order) the user can confirm to create. */
export async function runPortalAssistant(
  history: { role: "user" | "assistant"; content: string }[],
): Promise<{ text: string; proposal: RequestProposal | null }> {
  const messages: ModelMessage[] = history
    .slice(-MAX_TURNS)
    .filter((m) => m.content.trim())
    .map((m) => ({ role: m.role, content: m.content.slice(0, 4000) }));

  const { text, toolCalls } = await generateAiChat({
    system: SYSTEM_PROMPT,
    messages,
    tools: PORTAL_ASSISTANT_TOOLS,
    maxSteps: 6,
  });

  // Surface the most recent draft (whichever propose_* ran last) for the widget.
  let proposal: RequestProposal | null = null;
  const last = [...toolCalls].reverse().find((t) => t.name === "propose_request" || t.name === "propose_service_request");
  if (last) {
    proposal =
      last.name === "propose_service_request"
        ? await buildServiceProposal(last.input)
        : await buildTicketProposal(last.input);
  }

  return { text, proposal };
}
