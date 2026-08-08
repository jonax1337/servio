import { notFound } from "next/navigation";
import type { Metadata } from "next";
import { ArrowLeft, Eye, FolderOpen, User as UserIcon } from "lucide-react";
import { db } from "@/lib/db";
import { LinkButton } from "@/components/link-button";
import { format } from "date-fns";

export const dynamic = "force-dynamic";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string }>;
}): Promise<Metadata> {
  const { slug } = await params;
  const article = await db.article.findUnique({
    where: { slug },
    select: { title: true },
  });
  return { title: article ? article.title : "Article" };
}

export default async function ArticlePage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;

  const article = await db.article.findUnique({
    where: { slug },
    include: { category: true, author: true },
  });
  if (!article) notFound();

  await db.article.update({
    where: { id: article.id },
    data: { views: { increment: 1 } },
  });

  const authorName = article.author?.name ?? article.author?.email ?? null;

  return (
    <div className="mx-auto w-full max-w-3xl">
      <div className="flex items-center gap-3 border-b px-4 py-3 sm:px-6">
        <LinkButton href="/knowledge" variant="ghost" size="icon-sm">
          <ArrowLeft className="size-4" />
        </LinkButton>
        <span className="text-sm text-muted-foreground">Knowledge Base</span>
      </div>

      <div className="p-4 sm:p-6">
        <h1 className="font-display text-2xl font-semibold tracking-tight sm:text-3xl">
          {article.title}
        </h1>

        <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-1.5 text-sm text-muted-foreground">
          {authorName ? (
            <span className="inline-flex items-center gap-1.5">
              <UserIcon className="size-3.5" /> {authorName}
            </span>
          ) : null}
          {article.category ? (
            <span className="inline-flex items-center gap-1.5">
              <FolderOpen className="size-3.5" /> {article.category.name}
            </span>
          ) : null}
          <span className="inline-flex items-center gap-1.5">
            <Eye className="size-3.5" /> {article.views + 1} views
          </span>
          <span>·</span>
          <span>{format(article.createdAt, "PP")}</span>
        </div>

        <div className="mt-6 rounded-xl border bg-card p-5 sm:p-6">
          <article className="prose prose-invert max-w-none whitespace-pre-wrap text-sm leading-relaxed">
            {article.body}
          </article>
        </div>

        <div className="mt-6">
          <LinkButton href="/knowledge" variant="outline" size="sm">
            <ArrowLeft className="size-4" /> Back to Knowledge Base
          </LinkButton>
        </div>
      </div>
    </div>
  );
}
