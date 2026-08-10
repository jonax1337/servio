import Link from "next/link";
import { notFound } from "next/navigation";
import type { Metadata } from "next";
import { ArrowLeft, Eye, LifeBuoy } from "lucide-react";
import { db } from "@/lib/db";
import { LinkButton } from "@/components/link-button";
import { renderMarkdown, sanitizeCommentHtml } from "@/lib/markdown";
import { format } from "date-fns";

export const dynamic = "force-dynamic";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string }>;
}): Promise<Metadata> {
  const { slug } = await params;
  const a = await db.article.findUnique({ where: { slug }, select: { title: true } });
  return { title: a?.title ?? "Article" };
}

export default async function PortalArticle({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const article = await db.article.findUnique({
    where: { slug },
    include: { author: true, category: true },
  });
  // Portal readers only get published, public articles — internal ones 404.
  if (!article || article.status !== "PUBLISHED" || article.visibility !== "PUBLIC") notFound();

  await db.article.update({ where: { id: article.id }, data: { views: { increment: 1 } } });
  const html =
    article.bodyFormat === "html"
      ? sanitizeCommentHtml(article.body)
      : renderMarkdown(article.body, article.bodyFormat);

  return (
    <article className="mx-auto max-w-2xl">
      <LinkButton href="/portal/knowledge" variant="ghost" size="sm" className="mb-6 -ml-2">
        <ArrowLeft className="size-4" /> Back to knowledge base
      </LinkButton>

      <header className="border-b pb-6">
        <p className="text-xs font-medium uppercase tracking-wide text-primary">
          {article.category?.name ?? "General"}
        </p>
        <h1 className="mt-2 font-display text-3xl font-semibold tracking-tight">{article.title}</h1>
        <div className="mt-3 flex flex-wrap items-center gap-x-3 gap-y-1 text-sm text-muted-foreground">
          <span>{article.author?.name ?? "Servio Team"}</span>
          <span aria-hidden>·</span>
          <span>{format(article.createdAt, "PP")}</span>
          <span aria-hidden>·</span>
          <span className="flex items-center gap-1">
            <Eye className="size-3.5" /> {article.views + 1} views
          </span>
        </div>
      </header>

      <div
        className="prose prose-sm mt-6 max-w-none leading-relaxed dark:prose-invert prose-headings:font-display prose-headings:tracking-tight prose-a:text-primary"
        dangerouslySetInnerHTML={{ __html: html }}
      />

      <aside className="mt-10 flex flex-col items-start gap-3 rounded-2xl border bg-card/60 p-5 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-center gap-3">
          <span className="grid size-10 shrink-0 place-items-center rounded-xl bg-primary/10 text-primary">
            <LifeBuoy className="size-5" />
          </span>
          <div>
            <p className="text-sm font-medium">Still need a hand?</p>
            <p className="text-sm text-muted-foreground">
              If this didn&apos;t solve it, our team is ready to help.
            </p>
          </div>
        </div>
        <LinkButton href="/portal/new" size="sm" className="shrink-0">
          Contact the Service Desk
        </LinkButton>
      </aside>

      <div className="mt-6">
        <Link
          href="/portal/knowledge"
          className="text-sm font-medium text-primary transition-opacity hover:opacity-80"
        >
          Browse more articles
        </Link>
      </div>
    </article>
  );
}
