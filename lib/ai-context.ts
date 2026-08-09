import { cache } from "react";
import { db } from "@/lib/db";

/**
 * A compact directory of the organisation's teams, services and categories so the
 * AI can route work to REAL teams by name, consult a service's owner, and use
 * service descriptions to understand what's affected. Cached per request.
 */
export const getOrgDirectory = cache(async (): Promise<string> => {
  const [groups, services, categories] = await Promise.all([
    db.group.findMany({
      select: {
        name: true,
        type: true,
        description: true,
        manager: { select: { name: true } },
        _count: { select: { members: true } },
      },
      orderBy: { name: "asc" },
    }),
    db.service.findMany({
      where: { status: { not: "RETIRED" } },
      select: {
        name: true,
        description: true,
        status: true,
        criticality: true,
        owner: { select: { name: true } },
        category: { select: { name: true } },
      },
      orderBy: [{ criticality: "desc" }, { name: "asc" }],
    }),
    db.category.findMany({
      select: { name: true, description: true, parent: { select: { name: true } } },
      orderBy: { name: "asc" },
    }),
  ]);

  const teamLines =
    groups
      .map(
        (g) =>
          `- ${g.name}${g.type !== "TEAM" ? ` (${g.type.toLowerCase()})` : ""}` +
          `${g.description ? `: ${g.description}` : ""}` +
          `${g.manager?.name ? ` [lead: ${g.manager.name}]` : ""} (${g._count.members} members)`,
      )
      .join("\n") || "(no teams defined)";

  const serviceLines =
    services
      .map(
        (s) =>
          `- ${s.name} [${s.criticality} criticality, ${s.status}]` +
          `${s.description ? `: ${s.description}` : ""}` +
          `${s.owner?.name ? ` [owner: ${s.owner.name}]` : ""}` +
          `${s.category?.name ? ` (category: ${s.category.name})` : ""}`,
      )
      .join("\n") || "(no services defined)";

  const categoryLines =
    categories
      .map((c) => `- ${c.parent?.name ? `${c.parent.name} > ` : ""}${c.name}${c.description ? `: ${c.description}` : ""}`)
      .join("\n") || "(no categories defined)";

  return [
    "TEAMS (route work to these by name; never to a vague 'IT'):",
    teamLines,
    "",
    "SERVICES (what may be affected; a service's owner is the go-to person):",
    serviceLines,
    "",
    "CATEGORIES:",
    categoryLines,
  ].join("\n");
});
