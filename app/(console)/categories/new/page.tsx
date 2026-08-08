import type { Metadata } from "next";
import { FolderTree } from "lucide-react";
import { db } from "@/lib/db";
import { PageHeader, PageBody } from "@/components/page-header";
import { Card, CardContent } from "@/components/ui/card";
import { CategoryForm } from "@/components/categories/category-form";

export const metadata: Metadata = { title: "New category" };
export const dynamic = "force-dynamic";

export default async function NewCategoryPage() {
  const parents = await db.category.findMany({
    select: { id: true, name: true, type: true },
    orderBy: [{ type: "asc" }, { name: "asc" }],
  });

  return (
    <>
      <PageHeader
        icon={FolderTree}
        title="New category"
        description="Add a classification for tickets, problems, changes or assets."
      />
      <PageBody>
        <Card className="mx-auto max-w-3xl">
          <CardContent className="pt-6">
            <CategoryForm parents={parents} />
          </CardContent>
        </Card>
      </PageBody>
    </>
  );
}
