import type { Metadata } from "next";
import { BookOpen } from "lucide-react";
import { db } from "@/lib/db";
import { requireRole } from "@/lib/session";
import { PageHeader, PageBody } from "@/components/page-header";
import { Card, CardContent } from "@/components/ui/card";
import { ArticleEditor } from "@/components/knowledge/article-editor";
import { createArticle } from "@/lib/actions/knowledge";

export const metadata: Metadata = { title: "New article" };
export const dynamic = "force-dynamic";

export default async function NewArticlePage() {
  await requireRole("AGENT");
  const categories = await db.category.findMany({
    orderBy: { name: "asc" },
    select: { id: true, name: true },
  });

  return (
    <>
      <PageHeader
        icon={BookOpen}
        title="New article"
        description="Draft a knowledge base article. It starts as a draft until you publish it."
      />
      <PageBody>
        <Card className="mx-auto max-w-5xl">
          <CardContent>
            <ArticleEditor action={createArticle} categories={categories} submitLabel="Create article" />
          </CardContent>
        </Card>
      </PageBody>
    </>
  );
}
