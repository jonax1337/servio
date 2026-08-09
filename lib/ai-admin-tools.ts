import { tool } from "ai";
import { z } from "zod";
import { db } from "@/lib/db";
import { getStatistics, getSettingsOverview } from "@/lib/ai-stats";

/**
 * Admin-Vio READ tool set for the standalone /assistant chat (ADMIN scope only):
 * statistics, config overview, and record lookups. All WRITE actions (create /
 * update / delete across every entity) now live in the RBAC operation registry
 * (lib/ai-operations) and are surfaced as propose_* approval cards by the caller.
 *
 * Never expose secret setting values: get_settings_overview reports secrets as
 * "(set)"/"(not set)" only.
 */

/* ── Read tools ──────────────────────────────────────────────────────────── */

export const getStatisticsTool = tool({
  description:
    "Pull system-wide statistics. metric is one of: tickets_by_status, tickets_by_priority, " +
    "tickets_by_team, open_tickets, tickets_created, tickets_resolved, sla_breaches, " +
    "users_by_role, tickets_by_category, counts_overview. Optional groupBy (e.g. 'day' for " +
    "tickets_created) and timeframeDays (default 30 for created/resolved). Always call this " +
    "for numbers — never invent metrics.",
  inputSchema: z.object({
    metric: z
      .string()
      .describe(
        "one of: tickets_by_status, tickets_by_priority, tickets_by_team, open_tickets, tickets_created, tickets_resolved, sla_breaches, users_by_role, tickets_by_category, counts_overview",
      ),
    groupBy: z.string().optional(),
    timeframeDays: z.number().optional(),
  }),
  execute: async ({ metric, groupBy, timeframeDays }) =>
    getStatistics({ metric, groupBy, timeframeDays }),
});

export const getSettingsOverviewTool = tool({
  description:
    "Review the current (non-secret) configuration and whether each secret (API keys, SMTP " +
    "password, encryption key) is configured. NEVER reveals secret values — only whether they " +
    "are set.",
  inputSchema: z.object({}),
  execute: async () => getSettingsOverview(),
});

export const searchPeopleTool = tool({
  description:
    "Look up users (agents and end-users) by name or email. Returns name, email, role and active flag.",
  inputSchema: z.object({ query: z.string().describe("name or email fragment") }),
  execute: async ({ query }) => {
    const rows = await db.user.findMany({
      where: { OR: [{ name: { contains: query } }, { email: { contains: query } }] },
      take: 8,
      select: { name: true, email: true, role: true, isActive: true },
    });
    return rows.length ? rows : [{ name: "", email: "", role: "", isActive: false }];
  },
});

export const searchGroupsTool = tool({
  description: "Look up teams / departments / vendors by name. Returns name, type and description.",
  inputSchema: z.object({ query: z.string().describe("group name fragment") }),
  execute: async ({ query }) => {
    const rows = await db.group.findMany({
      where: { name: { contains: query } },
      take: 8,
      select: { name: true, type: true, description: true },
    });
    return rows.length ? rows : [{ name: "", type: "", description: null }];
  },
});

export const searchCategoriesTool = tool({
  description: "Look up ticket categories by name. Returns the category and its parent (if any).",
  inputSchema: z.object({ query: z.string().describe("category name fragment") }),
  execute: async ({ query }) => {
    const rows = await db.category.findMany({
      where: { name: { contains: query } },
      take: 8,
      select: { name: true, parent: { select: { name: true } } },
    });
    return rows.length
      ? rows.map((r) => ({ name: r.name, parent: r.parent?.name ?? null }))
      : [{ name: "", parent: null }];
  },
});

export const searchServicesTool = tool({
  description:
    "Look up services by name. Returns name, status, criticality and owner — use to find who owns an affected service.",
  inputSchema: z.object({ query: z.string().describe("service name fragment") }),
  execute: async ({ query }) => {
    const rows = await db.service.findMany({
      where: { name: { contains: query } },
      take: 8,
      select: { name: true, status: true, criticality: true, owner: { select: { name: true } } },
    });
    return rows.length
      ? rows.map((r) => ({
          name: r.name,
          status: r.status,
          criticality: r.criticality,
          owner: r.owner?.name ?? null,
        }))
      : [{ name: "", status: "", criticality: "", owner: null }];
  },
});

/** The admin READ tool set exposed to Admin-Vio (added on top of the general read tools). */
export const ASSISTANT_ADMIN_TOOLS = {
  get_statistics: getStatisticsTool,
  get_settings_overview: getSettingsOverviewTool,
  search_people: searchPeopleTool,
  search_groups: searchGroupsTool,
  search_categories: searchCategoriesTool,
  search_services: searchServicesTool,
};
