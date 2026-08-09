import Link from "next/link";
import { BookOpen, Eye, Plus } from "lucide-react";
import type { Metadata } from "next";
import type { Prisma } from "@prisma/client";
import { db } from "@/lib/db";
import { getParam, type SearchParams } from "@/lib/query";
import { PageHeader, PageBody } from "@/components/page-header";
import { ListToolbar } from "@/components/list-toolbar";
import { EmptyState } from "@/components/empty-state";
import { LinkButton } from "@/components/link-button";
import { StatusBadge } from "@/components/status-badge";
import {
  ARTICLE_STATUSES, ARTICLE_STATUS_META, ARTICLE_VISIBILITIES, ARTICLE_VISIBILITY_META,
} from "@/lib/constants";
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
  const status = getParam(sp, "status");
  const visibility = getParam(sp, "visibility");

  // Console is agent-only: show every status, not just published.
  const where: Prisma.ArticleWhereInput = {};
  if (q) where.title = { contains: q };
  if (status && ARTICLE_STATUSES.includes(status as (typeof ARTICLE_STATUSES)[number])) where.status = status;
  if (visibility && ARTICLE_VISIBILITIES.includes(visibility as (typeof ARTICLE_VISIBILITIES)[number])) where.visibility = visibility;

  const articles = await db.article.findMany({
    where,
    include: { category: true, author: true },
    orderBy: [{ updatedAt: "desc" }],
  });

  return (
    <>
      <PageHeader
        icon={BookOpen}
        title="Knowledge Base"
        description="Author, review and publish guides and known solutions."
      >
        <LinkButton href="/knowledge/new" size="sm">
          <Plus className="size-4" /> New article
        </LinkButton>
      </PageHeader>

      <PageBody className="grid gap-4">
        <ListToolbar
          searchPlaceholder="Search articles…"
          filters={[
            { key: "status", label: "Status", options: ARTICLE_STATUSES.map((s) => ({ value: s, label: ARTICLE_STATUS_META[s].label })) },
            { key: "visibility", label: "Visibility", options: ARTICLE_VISIBILITIES.map((v) => ({ value: v, label: ARTICLE_VISIBILITY_META[v].label })) },
          ]}
        />

        {articles.length === 0 ? (
          <EmptyState
            icon={BookOpen}
            title="No articles found"
            description="Adjust your filters, or create the first knowledge base article."
          />
        ) : (
          <div className="overflow-hidden rounded-xl border bg-card">
            <div className="divide-y">
              {articles.map((a) => (
                <Link
                  key={a.id}
                  href={`/knowledge/${a.slug}`}
                  className="flex items-center gap-3 px-4 py-3 transition-colors hover:bg-muted/50"
                >
                  <div className="min-w-0 flex-1">
                    <div className="truncate text-sm font-medium">{a.title}</div>
                    <div className="mt-0.5 flex items-center gap-2 text-xs text-muted-foreground">
                      <span>{a.category?.name ?? "General"}</span>
                      <span>·</span>
                      <span>{a.author?.name ?? a.author?.email ?? "Unknown"}</span>
                      <span>·</span>
                      <span>updated {formatDistanceToNow(a.updatedAt, { addSuffix: true })}</span>
                    </div>
                  </div>
                  <StatusBadge map={ARTICLE_VISIBILITY_META} value={a.visibility} />
                  <StatusBadge map={ARTICLE_STATUS_META} value={a.status} />
                  <span className="hidden w-14 shrink-0 items-center justify-end gap-1 text-xs text-muted-foreground sm:flex">
                    <Eye className="size-3.5" /> {a.views}
                  </span>
                </Link>
              ))}
            </div>
          </div>
        )}
      </PageBody>
    </>
  );
}
