import Link from "next/link";
import { BookOpen, Eye } from "lucide-react";
import type { Metadata } from "next";
import type { Prisma } from "@prisma/client";
import { db } from "@/lib/db";
import { getParam, type SearchParams } from "@/lib/query";
import { PageHeader, PageBody } from "@/components/page-header";
import { ListToolbar } from "@/components/list-toolbar";
import { EmptyState } from "@/components/empty-state";
import { formatDistanceToNow } from "date-fns";

export const metadata: Metadata = { title: "Knowledge Base" };
export const dynamic = "force-dynamic";

export default async function KnowledgePage({
  searchParams,
}: {
  searchParams: Promise<SearchParams>;
}) {
  const sp = await searchParams;
  const q = getParam(sp, "q");

  const where: Prisma.ArticleWhereInput = { published: true };
  if (q) where.title = { contains: q };

  const articles = await db.article.findMany({
    where,
    include: { category: true, author: true },
    orderBy: [{ createdAt: "desc" }],
  });

  return (
    <>
      <PageHeader
        icon={BookOpen}
        title="Knowledge Base"
        description="Guides, how-tos and known solutions for common requests."
      />

      <PageBody className="grid gap-4">
        <ListToolbar searchPlaceholder="Search articles…" />

        {articles.length === 0 ? (
          <EmptyState
            icon={BookOpen}
            title="No articles found"
            description="Try adjusting your search, or check back later for published articles."
          />
        ) : (
          <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
            {articles.map((a) => (
              <Link
                key={a.id}
                href={`/knowledge/${a.slug}`}
                className="group flex flex-col gap-3 rounded-xl border bg-card p-5 transition-colors hover:border-primary/40"
              >
                <div className="flex items-center gap-2">
                  {a.category ? (
                    <span className="rounded-full border px-2 py-0.5 text-xs text-muted-foreground">
                      {a.category.name}
                    </span>
                  ) : null}
                  <span className="ml-auto inline-flex items-center gap-1 text-xs text-muted-foreground">
                    <Eye className="size-3.5" /> {a.views}
                  </span>
                </div>

                <h3 className="line-clamp-2 font-medium leading-snug group-hover:text-primary">
                  {a.title}
                </h3>

                {a.excerpt ? (
                  <p className="line-clamp-3 text-sm text-muted-foreground">
                    {a.excerpt}
                  </p>
                ) : null}

                <div className="mt-auto flex items-center gap-2 pt-1 text-xs text-muted-foreground">
                  <span>{a.author?.name ?? a.author?.email ?? "Unknown author"}</span>
                  <span>·</span>
                  <span>{formatDistanceToNow(a.createdAt, { addSuffix: true })}</span>
                </div>
              </Link>
            ))}
          </div>
        )}
      </PageBody>
    </>
  );
}
