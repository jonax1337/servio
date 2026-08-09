import { tool } from "ai";
import { z } from "zod";
import net from "node:net";
import { lookup } from "node:dns/promises";
import { db } from "@/lib/db";
import { ticketRef, problemRef, changeRef, TICKET_STATUSES, PRIORITIES, IMPACT_URGENCY } from "@/lib/constants";

/**
 * Keyless web tools for the AI chat agent — DuckDuckGo HTML endpoint (no API key,
 * data stays self-hosted). Best-effort HTML scraping; results can be empty if DDG
 * rate-limits, which the agent handles gracefully.
 */

const UA =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0 Safari/537.36";

function decodeEntities(s: string): string {
  return s
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#x27;/g, "'")
    .replace(/&#39;/g, "'")
    .replace(/&nbsp;/g, " ");
}

function stripTags(s: string): string {
  return decodeEntities(s.replace(/<[^>]+>/g, "")).replace(/\s+/g, " ").trim();
}

/** DDG wraps result links as //duckduckgo.com/l/?uddg=<encoded target>. Unwrap it. */
function unwrapDdgUrl(href: string): string {
  const m = href.match(/[?&]uddg=([^&]+)/);
  if (m) {
    try {
      return decodeURIComponent(m[1]);
    } catch {
      /* fall through */
    }
  }
  return href.startsWith("//") ? "https:" + href : href;
}

export type WebResult = { title: string; url: string; snippet: string };

export async function duckDuckGoSearch(query: string, limit = 5): Promise<WebResult[]> {
  let html = "";
  try {
    const res = await fetch("https://html.duckduckgo.com/html/", {
      method: "POST",
      headers: { "User-Agent": UA, "Content-Type": "application/x-www-form-urlencoded" },
      body: "q=" + encodeURIComponent(query),
    });
    html = await res.text();
  } catch {
    return [];
  }

  const snippets: string[] = [];
  const snippetRe = /<a[^>]+class="result__snippet"[^>]*>([\s\S]*?)<\/a>/g;
  let sm: RegExpExecArray | null;
  while ((sm = snippetRe.exec(html)) !== null) snippets.push(stripTags(sm[1]));

  const results: WebResult[] = [];
  const linkRe = /<a[^>]+class="result__a"[^>]*href="([^"]+)"[^>]*>([\s\S]*?)<\/a>/g;
  let lm: RegExpExecArray | null;
  let i = 0;
  while ((lm = linkRe.exec(html)) !== null && results.length < limit) {
    const url = unwrapDdgUrl(lm[1]);
    const title = stripTags(lm[2]);
    if (title && url) results.push({ title, url, snippet: snippets[i] ?? "" });
    i++;
  }
  return results;
}

function ipv4ToInt(ip: string): number {
  const p = ip.split(".").map(Number);
  return (((p[0] << 24) >>> 0) + (p[1] << 16) + (p[2] << 8) + p[3]) >>> 0;
}

/** Block loopback, private, link-local, CGNAT, and unspecified IPv4 ranges. */
function isBlockedV4(ip: string): boolean {
  const n = ipv4ToInt(ip);
  const inRange = (base: string, maskBits: number) => {
    const mask = maskBits === 0 ? 0 : (0xffffffff << (32 - maskBits)) >>> 0;
    return (n & mask) === (ipv4ToInt(base) & mask);
  };
  return (
    inRange("0.0.0.0", 8) ||        // "this" network
    inRange("10.0.0.0", 8) ||       // private
    inRange("100.64.0.0", 10) ||    // CGNAT
    inRange("127.0.0.0", 8) ||      // loopback
    inRange("169.254.0.0", 16) ||   // link-local (cloud metadata)
    inRange("172.16.0.0", 12) ||    // private
    inRange("192.168.0.0", 16)      // private
  );
}

/** True if an IP must not be fetched (SSRF guard). */
function isBlockedIp(ip: string): boolean {
  const mapped = ip.match(/^::ffff:(\d+\.\d+\.\d+\.\d+)$/i); // IPv4-mapped IPv6
  if (mapped) return isBlockedV4(mapped[1]);
  if (net.isIPv4(ip)) return isBlockedV4(ip);
  const s = ip.toLowerCase();
  if (s === "::1" || s === "::") return true;                 // loopback / unspecified
  if (/^fe[89ab]/.test(s)) return true;                       // fe80::/10 link-local
  if (/^f[cd]/.test(s)) return true;                          // fc00::/7 unique-local
  return false;
}

/** Validate a URL is public & fetchable (SSRF guard: resolve DNS, reject internal IPs). */
async function assertPublicUrl(raw: string): Promise<{ ok: true; url: URL } | { ok: false; reason: string }> {
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    return { ok: false, reason: "invalid URL" };
  }
  if (url.protocol !== "http:" && url.protocol !== "https:") {
    return { ok: false, reason: "only http/https is allowed" };
  }
  let addrs: { address: string }[];
  try {
    addrs = await lookup(url.hostname, { all: true });
  } catch {
    return { ok: false, reason: "DNS resolution failed" };
  }
  if (addrs.length === 0) return { ok: false, reason: "no DNS records" };
  if (addrs.some((a) => isBlockedIp(a.address))) {
    return { ok: false, reason: "target resolves to a private/internal address" };
  }
  return { ok: true, url };
}

export async function fetchUrlText(url: string, maxChars = 4000): Promise<string> {
  // Follow redirects manually so each hop is re-validated (SSRF via redirect).
  let current = url;
  for (let hop = 0; hop < 4; hop++) {
    const check = await assertPublicUrl(current);
    if (!check.ok) return `Blocked URL: ${check.reason}.`;
    let res: Response;
    try {
      res = await fetch(check.url, { headers: { "User-Agent": UA }, redirect: "manual" });
    } catch (e) {
      return `Failed to fetch: ${e instanceof Error ? e.message : "error"}`;
    }
    if (res.status >= 300 && res.status < 400) {
      const loc = res.headers.get("location");
      if (!loc) return "Redirect without a location.";
      current = new URL(loc, check.url).toString();
      continue;
    }
    const ct = res.headers.get("content-type") ?? "";
    if (!ct.includes("text/html") && !ct.includes("text/plain")) {
      return `Unsupported content type: ${ct || "unknown"}`;
    }
    const html = await res.text();
    const text = stripTags(
      html.replace(/<script[\s\S]*?<\/script>/gi, "").replace(/<style[\s\S]*?<\/style>/gi, ""),
    );
    return text.slice(0, maxChars) || "(no readable text)";
  }
  return "Too many redirects.";
}

export const webSearchTool = tool({
  description:
    "Search the public web (DuckDuckGo) for current or external information that is NOT in the ticket. Returns top results with title, url and snippet.",
  inputSchema: z.object({ query: z.string().describe("the search query") }),
  execute: async ({ query }) => {
    const results = await duckDuckGoSearch(query, 5);
    return results.length ? results : [{ title: "No results found", url: "", snippet: "" }];
  },
});

export const fetchUrlTool = tool({
  description:
    "Fetch and read the main text of a web page by URL (e.g. one of the search results) when the snippet isn't enough.",
  inputSchema: z.object({ url: z.string().describe("the http(s) URL to read") }),
  execute: async ({ url }) => ({ text: await fetchUrlText(url) }),
});

export const knowledgeSearchTool = tool({
  description:
    "Search the internal Knowledge Base (published how-to and troubleshooting articles) for guidance and known solutions. Prefer this over the web for anything the company documents itself.",
  inputSchema: z.object({ query: z.string().describe("keywords to search KB articles for") }),
  execute: async ({ query }) => {
    const rows = await db.article.findMany({
      where: {
        status: "PUBLISHED",
        OR: [{ title: { contains: query } }, { excerpt: { contains: query } }, { body: { contains: query } }],
      },
      take: 5,
      orderBy: { views: "desc" },
      select: { title: true, slug: true, excerpt: true, visibility: true },
    });
    return rows.length
      ? rows.map((r) => ({ title: r.title, url: `/knowledge/${r.slug}`, excerpt: r.excerpt ?? "", audience: r.visibility }))
      : [{ title: "No matching KB articles", url: "", excerpt: "", audience: "" }];
  },
});

export const ticketSearchTool = tool({
  description:
    "Search past and current tickets by keyword (title, description, and comments) to find similar issues and how they were resolved or routed.",
  inputSchema: z.object({ query: z.string().describe("keywords to search tickets for") }),
  execute: async ({ query }) => {
    const rows = await db.ticket.findMany({
      where: {
        OR: [
          { title: { contains: query } },
          { description: { contains: query } },
          { comments: { some: { body: { contains: query } } } },
        ],
      },
      take: 6,
      orderBy: { updatedAt: "desc" },
      select: {
        id: true,
        title: true,
        type: true,
        status: true,
        priority: true,
        resolutionCode: true,
        group: { select: { name: true } },
        category: { select: { name: true } },
      },
    });
    return rows.length
      ? rows.map((t) => ({
          ref: ticketRef(t.id, t.type),
          title: t.title,
          status: t.status,
          priority: t.priority,
          team: t.group?.name ?? null,
          category: t.category?.name ?? null,
          resolution: t.resolutionCode ?? null,
        }))
      : [{ ref: "", title: "No matching tickets", status: "", priority: "", team: null, category: null, resolution: null }];
  },
});

export const problemSearchTool = tool({
  description:
    "Search Problem records (root-cause investigations & known errors) by keyword, including their comments. Use for 'is there a known error / root cause / workaround for this' and recurring incidents.",
  inputSchema: z.object({ query: z.string().describe("keywords to search problems for") }),
  execute: async ({ query }) => {
    const rows = await db.problem.findMany({
      where: {
        OR: [
          { title: { contains: query } },
          { description: { contains: query } },
          { comments: { some: { body: { contains: query } } } },
        ],
      },
      take: 5,
      orderBy: { updatedAt: "desc" },
      select: {
        id: true, title: true, status: true, priority: true, rootCause: true, workaround: true,
        group: { select: { name: true } },
      },
    });
    return rows.length
      ? rows.map((p) => ({
          ref: problemRef(p.id),
          title: p.title,
          status: p.status,
          priority: p.priority,
          rootCause: p.rootCause ?? null,
          workaround: p.workaround ?? null,
          team: p.group?.name ?? null,
        }))
      : [{ ref: "", title: "No matching problems", status: "", priority: "", rootCause: null, workaround: null, team: null }];
  },
});

export const changeSearchTool = tool({
  description:
    "Search Change records (planned changes & maintenance) by keyword, including their comments. Use for 'was there a recent change that could have caused this' and scheduled work.",
  inputSchema: z.object({ query: z.string().describe("keywords to search changes for") }),
  execute: async ({ query }) => {
    const rows = await db.change.findMany({
      where: {
        OR: [
          { title: { contains: query } },
          { description: { contains: query } },
          { comments: { some: { body: { contains: query } } } },
        ],
      },
      take: 5,
      orderBy: { updatedAt: "desc" },
      select: {
        id: true, title: true, status: true, type: true, risk: true, plannedStart: true,
        group: { select: { name: true } },
      },
    });
    return rows.length
      ? rows.map((c) => ({
          ref: changeRef(c.id),
          title: c.title,
          status: c.status,
          type: c.type,
          risk: c.risk,
          plannedStart: c.plannedStart ? c.plannedStart.toISOString().slice(0, 10) : null,
          team: c.group?.name ?? null,
        }))
      : [{ ref: "", title: "No matching changes", status: "", type: "", risk: "", plannedStart: null, team: null }];
  },
});

/* ── Write actions: PROPOSE-only. These never mutate — they are validated and the
      agent must approve them live in the chat before applyTicketProposal runs. ── */

export async function resolveGroupId(name: string) {
  const q = name.trim();
  return db.group.findFirst({ where: { OR: [{ name: q }, { name: { contains: q } }] }, select: { id: true, name: true } });
}
export async function resolveCategoryId(name: string) {
  const q = name.trim();
  return db.category.findFirst({ where: { OR: [{ name: q }, { name: { contains: q } }] }, select: { id: true, name: true } });
}
export async function resolveAgentId(name: string) {
  const q = name.trim();
  return db.user.findFirst({
    where: { role: { in: ["ADMIN", "MANAGER", "AGENT"] }, OR: [{ name: { contains: q } }, { email: q }] },
    select: { id: true, name: true },
  });
}
export function parseTicketId(ref: string): number | null {
  const m = String(ref).match(/(\d+)/);
  return m ? Number(m[1]) : null;
}

const FIELD_ENUMS: Record<string, readonly string[]> = {
  status: TICKET_STATUSES,
  priority: PRIORITIES,
  impact: IMPACT_URGENCY,
  urgency: IMPACT_URGENCY,
};

export const proposeUpdateFieldTool = tool({
  description:
    "PROPOSE a change to the CURRENT ticket's field for the agent to approve. This does NOT apply immediately. " +
    "Fields: status, priority, impact, urgency, team, category, assignee. Use a human value/name (e.g. status " +
    "'RESOLVED', team 'Infrastructure', assignee 'Nora K900'). Always include a short reason.",
  inputSchema: z.object({
    field: z.enum(["status", "priority", "impact", "urgency", "team", "category", "assignee"]),
    value: z.string().describe("target value or name"),
    reason: z.string().describe("one short line: why this change"),
  }),
  execute: async ({ field, value }) => {
    if (field in FIELD_ENUMS) {
      const up = value.trim().toUpperCase();
      if (!FIELD_ENUMS[field].includes(up)) {
        return { ok: false, error: `Invalid ${field} "${value}". Allowed: ${FIELD_ENUMS[field].join(", ")}.` };
      }
      return { ok: true, proposed: `set ${field} to ${up} (awaiting the agent's approval)` };
    }
    if (field === "team") {
      const g = await resolveGroupId(value);
      return g ? { ok: true, proposed: `route to team ${g.name} (awaiting approval)` } : { ok: false, error: `No team matches "${value}". Use an exact team name from the directory.` };
    }
    if (field === "category") {
      const c = await resolveCategoryId(value);
      return c ? { ok: true, proposed: `set category ${c.name} (awaiting approval)` } : { ok: false, error: `No category matches "${value}".` };
    }
    const u = await resolveAgentId(value);
    return u ? { ok: true, proposed: `assign to ${u.name} (awaiting approval)` } : { ok: false, error: `No agent matches "${value}".` };
  },
});

export const proposeInternalNoteTool = tool({
  description:
    "PROPOSE adding an internal note (agents only, not visible to the requester) to the current ticket. Does NOT apply until the agent approves it in chat.",
  inputSchema: z.object({ text: z.string().describe("the note content (markdown allowed)") }),
  execute: async () => ({ ok: true, proposed: "internal note queued for the agent's approval" }),
});

export const proposeLinkTicketTool = tool({
  description:
    "PROPOSE linking the current ticket to another ticket (e.g. a duplicate or related incident). Does NOT apply until approved. Give the target ticket ref or number.",
  inputSchema: z.object({
    target: z.string().describe("target ticket ref or number, e.g. 'INC-0122' or '122'"),
    relation: z.enum(["RELATED", "DUPLICATE", "BLOCKS", "CAUSED_BY"]).optional(),
  }),
  execute: async ({ target }) => {
    const id = parseTicketId(target);
    if (!id) return { ok: false, error: `Cannot parse a ticket number from "${target}".` };
    const t = await db.ticket.findUnique({ where: { id }, select: { id: true, title: true } });
    return t ? { ok: true, proposed: `link to ${target} ("${t.title}"), awaiting approval` } : { ok: false, error: `No ticket ${target} found.` };
  },
});

/** The tool set exposed to the ticket chat agent — the whole ITSM record space,
 *  plus PROPOSE-only write actions that require the agent's live approval. */
export const AI_CHAT_TOOLS = {
  web_search: webSearchTool,
  fetch_url: fetchUrlTool,
  search_knowledge_base: knowledgeSearchTool,
  search_tickets: ticketSearchTool,
  search_problems: problemSearchTool,
  search_changes: changeSearchTool,
  propose_update_field: proposeUpdateFieldTool,
  propose_internal_note: proposeInternalNoteTool,
  propose_link_ticket: proposeLinkTicketTool,
};
