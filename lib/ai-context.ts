import { cache } from "react";
import { db } from "@/lib/db";
import { ticketRef, problemRef, changeRef } from "@/lib/constants";

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

/** First non-empty line of a possibly-multiline text, trimmed and length-bounded. */
function firstLine(text: string | null | undefined, max = 160): string | null {
  if (!text) return null;
  const line = text.split(/\r?\n/).map((l) => l.trim()).find((l) => l.length > 0);
  if (!line) return null;
  return line.length > max ? `${line.slice(0, max - 1)}…` : line;
}

/**
 * A compact "CURRENT PROJECT" block for a Sable Project the chat is pinned to:
 * the project name, its custom INSTRUCTIONS (verbatim), short summaries of any
 * bound Change / Problem / Ticket, and the FILES list (names + folder path) so
 * the model knows what `project.search_files` can retrieve. Returns null if the
 * project is missing. Access is authorised by the caller (upstream) — this is a
 * plain server-side read. The files list is bounded to ~1500 chars.
 */
export async function getProjectContext(projectId: string, _actorId: string): Promise<string | null> {
  const project = await db.aiProject.findUnique({
    where: { id: projectId },
    select: {
      name: true,
      instructions: true,
      change: {
        select: { id: true, title: true, status: true, implementationPlan: true, rollbackPlan: true },
      },
      problem: { select: { id: true, title: true, status: true } },
      ticket: { select: { id: true, title: true, status: true, type: true, prefix: true } },
    },
  });
  if (!project) return null;

  const lines: string[] = [`Project: ${project.name}`];

  const instructions = project.instructions?.trim();
  if (instructions) {
    lines.push("", "INSTRUCTIONS (follow these for this project):", instructions);
  }

  const bound: string[] = [];
  if (project.change) {
    const c = project.change;
    bound.push(`- Change ${changeRef(c.id)} [${c.status}]: ${c.title}`);
    const impl = firstLine(c.implementationPlan);
    if (impl) bound.push(`  implementation: ${impl}`);
    const roll = firstLine(c.rollbackPlan);
    if (roll) bound.push(`  rollback: ${roll}`);
  }
  if (project.problem) {
    const p = project.problem;
    bound.push(`- Problem ${problemRef(p.id)} [${p.status}]: ${p.title}`);
  }
  if (project.ticket) {
    const t = project.ticket;
    bound.push(`- Ticket ${ticketRef(t.id, t.prefix || t.type)} [${t.status}]: ${t.title}`);
  }
  if (bound.length) {
    lines.push("", "BOUND RECORDS (treat as the subject of this project):", ...bound);
  }

  // Files list: name + folder path, so the model knows what search_files covers.
  const [folders, files] = await Promise.all([
    db.aiProjectFolder.findMany({
      where: { projectId },
      select: { id: true, name: true, parentId: true },
    }),
    db.aiProjectFile.findMany({
      where: { projectId },
      orderBy: { createdAt: "asc" },
      select: { name: true, folderId: true },
    }),
  ]);
  const folderById = new Map(folders.map((f) => [f.id, f]));
  const folderPath = (id: string | null): string => {
    const parts: string[] = [];
    let cur = id ? folderById.get(id) : undefined;
    let guard = 0;
    while (cur && guard++ < 20) {
      parts.unshift(cur.name);
      cur = cur.parentId ? folderById.get(cur.parentId) : undefined;
    }
    return parts.length ? parts.join("/") : "";
  };

  if (files.length) {
    const fileLines: string[] = [];
    let budget = 1500;
    let shown = 0;
    for (const f of files) {
      const path = folderPath(f.folderId);
      const line = `- ${path ? `${path}/` : ""}${f.name}`;
      if (budget - line.length < 0) break;
      fileLines.push(line);
      budget -= line.length + 1;
      shown++;
    }
    const remaining = files.length - shown;
    lines.push(
      "",
      `FILES (${files.length} in the project library — use project.search_files to read passages from them):`,
      ...fileLines,
    );
    if (remaining > 0) lines.push(`- …and ${remaining} more file${remaining === 1 ? "" : "s"}`);
  } else {
    lines.push("", "FILES: (no files uploaded to this project yet)");
  }

  return lines.join("\n");
}
