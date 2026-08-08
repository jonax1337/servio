import { notFound } from "next/navigation";
import type { Metadata } from "next";
import { ArrowLeft, Eye } from "lucide-react";
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
  if (!article || !article.published) notFound();

  await db.article.update({ where: { id: article.id }, data: { views: { increment: 1 } } });

  return (
    <article className="mx-auto max-w-2xl">
      <LinkButton href="/portal/knowledge" variant="ghost" size="sm" className="mb-6">
        <ArrowLeft className="size-4" /> Back to knowledge base
      </LinkButton>
      <p className="text-xs font-medium uppercase tracking-wide text-primary">
        {article.category?.name ?? "General"}
      </p>
      <h1 className="mt-2 font-display text-3xl font-semibold tracking-tight">{article.title}</h1>
      <div className="mt-2 flex items-center gap-3 text-sm text-muted-foreground">
        <span>{article.author?.name ?? "Servio Team"}</span>
        <span>·</span>
        <span>{format(article.createdAt, "PP")}</span>
        <span>·</span>
        <span className="flex items-center gap-1"><Eye className="size-3.5" /> {article.views + 1}</span>
      </div>
      <div className="prose prose-invert mt-6 max-w-none whitespace-pre-wrap text-sm leading-relaxed">
        {article.body}
      </div>
    </article>
  );
}
