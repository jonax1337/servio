import { z } from "zod";
import { db } from "@/lib/db";
import { writeAudit } from "@/lib/audit";
import { resolveCategoryId } from "@/lib/ai-tools";
import { renderMarkdown } from "@/lib/markdown";
import { changeArticleStatus } from "@/lib/actions/knowledge";
import { ARTICLE_STATUSES, ARTICLE_VISIBILITIES } from "@/lib/constants";
import type { AiOperation } from "../types";
import { ok, err, str, toFormData, coerceEnum } from "../helpers";

/**
 * Knowledge Base articles. Reference module shape: export `OPERATIONS`, one entry
 * per capability, guarded Prisma writes + writeAudit — except `set_status`, which
 * reuses the app's real non-redirecting action so `published`/`publishedAt` stay
 * in lock-step. Article bodies are stored as sanitised HTML (bodyFormat "html"),
 * so we always run `renderMarkdown` on the incoming body before persisting.
 */

/** URL slug from a title: lowercase, non-alphanumerics → "-", collapse, trim. */
function slugify(title: string): string {
  return title
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "");
}

/** Ensure a unique slug by appending "-2", "-3", … (up to 5 tries). */
async function uniqueSlug(base: string): Promise<string> {
  const root = base || "article";
  for (let i = 1; i <= 5; i++) {
    const slug = i === 1 ? root : `${root}-${i}`;
    const existing = await db.article.findUnique({ where: { slug }, select: { id: true } });
    if (!existing) return slug;
  }
  // Last resort: suffix with a short random token so we never collide.
  return `${root}-${Math.random().toString(36).slice(2, 8)}`;
}

/** Cheap heuristic: does this look like it already contains HTML tags? */
function looksLikeHtml(text: string): boolean {
  return /<\/?[a-z][\s\S]*>/i.test(text);
}

export const OPERATIONS: AiOperation[] = [
  {
    id: "article.create",
    group: "Knowledge",
    kind: "write",
    minRole: "AGENT",
    description:
      "Create a Knowledge Base article. The body may be markdown or HTML (it is rendered to sanitised HTML). " +
      "Optionally set an excerpt, a category (by name) and visibility (INTERNAL for agents, PUBLIC for the portal). " +
      "New articles start as a DRAFT — publish them with article.set_status.",
    input: z.object({
      title: z.string().min(3).max(160).describe("article title"),
      body: z.string().describe("article body (markdown or HTML)"),
      excerpt: z.string().max(300).optional().describe("short summary shown in listings"),
      category: z.string().optional().describe("category name"),
      visibility: z.string().optional().describe("INTERNAL (agents) or PUBLIC (portal); defaults to INTERNAL"),
    }),
    label: (a) => `Create article “${str(a.title) ?? ""}”`,
    run: async (a, ctx) => {
      const title = str(a.title);
      if (!title || title.length < 3) return err("Title must be at least 3 characters.");
      if (title.length > 160) return err("Title must be at most 160 characters.");

      const rawBody = str(a.body);
      if (!rawBody) return err("Article body is required.");

      const excerpt = str(a.excerpt);
      if (excerpt && excerpt.length > 300) return err("Excerpt must be at most 300 characters.");

      const visibility = coerceEnum(a.visibility ?? "INTERNAL", ARTICLE_VISIBILITIES);
      if (!visibility) return err(`Invalid visibility. Allowed: ${ARTICLE_VISIBILITIES.join(", ")}.`);

      let categoryId: string | null = null;
      if (str(a.category)) {
        const cat = await resolveCategoryId(String(a.category));
        if (!cat) return err(`Category not found: ${a.category}`);
        categoryId = cat.id;
      }

      // Bodies are persisted as sanitised HTML; render markdown when it isn't already HTML.
      const html = renderMarkdown(rawBody, looksLikeHtml(rawBody) ? "html" : "markdown");
      const slug = await uniqueSlug(slugify(title));

      const article = await db.article.create({
        data: {
          title,
          slug,
          excerpt: excerpt ?? null,
          body: html,
          bodyFormat: "html",
          status: "DRAFT",
          visibility,
          published: false,
          categoryId,
          authorId: ctx.userId,
          revisions: {
            create: { version: 1, title, excerpt: excerpt ?? null, body: html, editorId: ctx.userId, note: "Created" },
          },
        },
        select: { id: true },
      });

      await writeAudit({ userId: ctx.userId, action: "CREATE", entity: "Article", entityId: article.id, summary: `Created article "${title}" via Sable` });
      return ok(`Created article "${title}"`);
    },
  },
  {
    id: "article.set_status",
    group: "Knowledge",
    kind: "write",
    minRole: "AGENT",
    description:
      "Change a Knowledge Base article's status (DRAFT, REVIEW, PUBLISHED, RETIRED). Identify the article by title. " +
      "Setting PUBLISHED publishes it (and stamps its first publish time); other statuses unpublish it.",
    input: z.object({
      title: z.string().describe("the article's title (a partial match is fine)"),
      status: z.string().describe("DRAFT, REVIEW, PUBLISHED or RETIRED"),
    }),
    label: (a) => `Set article “${str(a.title) ?? ""}” → ${String(a.status ?? "").toUpperCase()}`,
    run: async (a, ctx) => {
      const title = str(a.title);
      if (!title) return err("Article title is required.");

      const status = coerceEnum(a.status, ARTICLE_STATUSES);
      if (!status) return err(`Invalid status. Allowed: ${ARTICLE_STATUSES.join(", ")}.`);

      const article = await db.article.findFirst({
        where: { title: { contains: title } },
        select: { id: true, title: true, status: true, published: true, publishedAt: true },
      });
      if (!article) return err(`Article not found: ${title}`);

      // Reuse the real non-redirecting action so published/publishedAt stay in sync + it audits.
      await changeArticleStatus(toFormData({ id: article.id, status }));
      return ok(`Set article "${article.title}" status to ${status}`);
    },
  },
  {
    id: "article.delete",
    group: "Knowledge",
    kind: "write",
    minRole: "AGENT",
    description: "Delete a Knowledge Base article (and its revisions and attachments). Identify it by title.",
    input: z.object({ title: z.string().describe("the article's title (a partial match is fine)") }),
    label: (a) => `Delete article “${str(a.title) ?? ""}”`,
    run: async (a, ctx) => {
      const title = str(a.title);
      if (!title) return err("Article title is required.");

      const article = await db.article.findFirst({
        where: { title: { contains: title } },
        select: { id: true, title: true },
      });
      if (!article) return err(`Article not found: ${title}`);

      try {
        await db.article.delete({ where: { id: article.id } });
      } catch (e) {
        if ((e as { code?: string })?.code === "P2025") return err(`Article not found: ${title}`);
        throw e;
      }

      await writeAudit({ userId: ctx.userId, action: "DELETE", entity: "Article", entityId: article.id, summary: `Deleted article "${article.title}" via Sable` });
      return ok(`Deleted article "${article.title}"`);
    },
  },
];
