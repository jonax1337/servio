import Link from "next/link";
import type { Metadata } from "next";
import { BookOpen, Eye, ArrowRight } from "lucide-react";
import { db } from "@/lib/db";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import type { SearchParams } from "@/lib/query";
import { getParam } from "@/lib/query";

export const metadata: Metadata = { title: "Knowledge base" };
export const dynamic = "force-dynamic";

export default async function PortalKnowledge({
  searchParams,
}: {
  searchParams: Promise<SearchParams>;
}) {
  const sp = await searchParams;
  const q = getParam(sp, "q");
  const articles = await db.article.findMany({
    // End users only ever see published, public-facing articles.
    where: {
      status: "PUBLISHED",
      visibility: "PUBLIC",
      ...(q ? { OR: [{ title: { contains: q } }, { excerpt: { contains: q } }] } : {}),
    },
    orderBy: { views: "desc" },
    include: { category: true },
  });

  return (
    <div className="grid gap-6">
      <div>
        <h1 className="font-display text-2xl font-semibold tracking-tight">Knowledge base</h1>
        <p className="text-sm text-muted-foreground">Guides and answers to common questions.</p>
      </div>
      <form className="max-w-md">
        <div className="relative">
          <BookOpen className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input name="q" defaultValue={q ?? ""} placeholder="Search articles…" className="pl-9" />
        </div>
      </form>
      <div className="grid gap-4 sm:grid-cols-2">
        {articles.map((a) => (
          <Link key={a.id} href={`/portal/knowledge/${a.slug}`}>
            <Card className="h-full transition-colors hover:border-primary/40">
              <CardHeader>
                <CardTitle className="text-base">{a.title}</CardTitle>
              </CardHeader>
              <CardContent className="grid gap-3 text-sm text-muted-foreground">
                <p className="line-clamp-2">{a.excerpt}</p>
                <div className="flex items-center justify-between text-xs">
                  <span>{a.category?.name ?? "General"}</span>
                  <span className="flex items-center gap-1"><Eye className="size-3.5" /> {a.views}</span>
                </div>
                <span className="flex items-center gap-1 text-xs font-medium text-primary">
                  Read article <ArrowRight className="size-3.5" />
                </span>
              </CardContent>
            </Card>
          </Link>
        ))}
      </div>
    </div>
  );
}
